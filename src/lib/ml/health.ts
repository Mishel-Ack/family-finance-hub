export interface HealthInputs {
  monthlySpendPaise: number[];
  monthlyBudgetPaise?: number[];
  monthlyIncomePaise?: number;
  recurringBillPaise?: number;
  emergencyFundPaise?: number;
  essentialMonthlySpendPaise?: number;
}

export interface HealthComponent {
  key:
    | "budgetAdherence"
    | "savingsRate"
    | "spendingStability"
    | "recurringBillLoad"
    | "overspendFrequency"
    | "emergencyFundCoverage";
  weight: number;
  value: number | null;
  explanation: string;
}

export interface FinancialHealthScore {
  score: number | null;
  confidence: number;
  components: HealthComponent[];
  reason: string;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function financialHealthScore(input: HealthInputs): FinancialHealthScore {
  const weights = {
    budgetAdherence: 25,
    savingsRate: 25,
    spendingStability: 15,
    recurringBillLoad: 10,
    overspendFrequency: 15,
    emergencyFundCoverage: 10,
  } as const;
  const spend = input.monthlySpendPaise.filter((value) => Number.isFinite(value) && value >= 0);
  const budgets = input.monthlyBudgetPaise ?? [];
  const budgetRatios = spend.flatMap((amount, index) => {
    const budget = budgets[index];
    return budget && budget > 0 ? [amount / budget] : [];
  });
  const adherence = average(
    budgetRatios.map((ratio) => Math.max(0, Math.min(100, 100 - Math.max(0, ratio - 1) * 100))),
  );
  const overspend = budgetRatios.length
    ? (budgetRatios.filter((ratio) => ratio > 1).length / budgetRatios.length) * 100
    : null;
  const totalSpend = average(spend);
  const income = input.monthlyIncomePaise;
  const savingsRate =
    income && income > 0 && totalSpend !== null
      ? Math.max(0, Math.min(100, ((income - totalSpend) / income) * 100 * 5))
      : null;
  const mean = totalSpend;
  const variance =
    mean && spend.length > 1
      ? spend.reduce((sum, amount) => sum + (amount - mean) ** 2, 0) / spend.length
      : null;
  const stability =
    mean && variance !== null
      ? Math.max(0, Math.min(100, 100 - (Math.sqrt(variance) / mean) * 100))
      : null;
  const recurringLoad =
    income && income > 0 && input.recurringBillPaise !== undefined
      ? Math.max(0, Math.min(100, 100 - (input.recurringBillPaise / income) * 200))
      : null;
  const essential = input.essentialMonthlySpendPaise;
  const emergencyCoverage =
    essential && essential > 0 && input.emergencyFundPaise !== undefined
      ? Math.max(0, Math.min(100, (input.emergencyFundPaise / essential / 6) * 100))
      : null;

  const values: Record<HealthComponent["key"], number | null> = {
    budgetAdherence: adherence,
    savingsRate,
    spendingStability: stability,
    recurringBillLoad: recurringLoad,
    overspendFrequency: overspend === null ? null : 100 - overspend,
    emergencyFundCoverage: emergencyCoverage,
  };
  const explanations: Record<HealthComponent["key"], string> = {
    budgetAdherence:
      adherence === null
        ? "Budget history is not configured yet."
        : "Higher means spending stayed closer to the set budgets.",
    savingsRate:
      savingsRate === null
        ? "Configure monthly income to estimate a savings rate."
        : "Higher means a larger share of income remained after spending.",
    spendingStability:
      stability === null
        ? "At least two months of spending are needed to measure stability."
        : "Higher means monthly spending changed less from month to month.",
    recurringBillLoad:
      recurringLoad === null
        ? "Income is needed to compare recurring bills with available funds."
        : "Higher means recurring bills use a smaller share of income.",
    overspendFrequency:
      overspend === null
        ? "Budget history is not configured yet."
        : "Higher means fewer tracked months exceeded their budgets.",
    emergencyFundCoverage:
      emergencyCoverage === null
        ? "Set an emergency fund and typical essential spending to measure coverage."
        : "Higher means the emergency fund covers more essential months.",
  };
  const components: HealthComponent[] = (Object.keys(weights) as HealthComponent["key"][]).map(
    (key) => ({
      key,
      weight: weights[key],
      value: values[key] === null ? null : Math.round(values[key]!),
      explanation: explanations[key],
    }),
  );
  const availableWeight = components
    .filter((component) => component.value !== null)
    .reduce((sum, component) => sum + component.weight, 0);
  const weighted = components.reduce(
    (sum, component) => sum + (component.value === null ? 0 : component.value * component.weight),
    0,
  );
  const score = availableWeight ? Math.round(weighted / availableWeight) : null;
  return {
    score,
    confidence: availableWeight,
    components,
    reason:
      score === null
        ? "Not enough family data yet to calculate a health score."
        : `${Math.round(availableWeight)}% of the score weight is supported by configured income, budgets, recurring bills, fund data, or spending history.`,
  };
}
