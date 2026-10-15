import { seededRandom } from "@/lib/ml/forecast";

export type ScenarioChange =
  | {
      type: "REDUCE_CATEGORY";
      categoryId: string;
      percent: number;
      fromMonth?: number | undefined;
    }
  | { type: "RECURRING_EXPENSE"; categoryId: string; amountPaise: number; startMonth: number }
  | { type: "ONE_OFF_EXPENSE"; categoryId: string; amountPaise: number; month: number }
  | { type: "INCOME_CHANGE"; amountPaise: number; fromMonth: number }
  | { type: "SAVINGS_TARGET"; amountPaise: number };

export interface SimulationMonth {
  month: number;
  spendPaise: { p10: number; p50: number; p90: number };
  probabilityWithinBudget: number | null;
  projectedSavingsPaise: { p10: number; p50: number; p90: number };
}

export interface SimulationResult {
  months: SimulationMonth[];
  probabilityMeetingSavingsTarget: number | null;
  cumulativeSavingsRangePaise: { p10: number; p50: number; p90: number };
  dataSufficiency: "SUFFICIENT" | "LOW" | "NONE";
  reason: string;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor((sorted.length - 1) * p)] ?? 0);
}

export function simulateScenario(options: {
  historyByCategory: Record<string, number[]>;
  changes: ScenarioChange[];
  budgetByMonth?: number[];
  monthlyIncomePaise?: number;
  runs?: number;
  months?: number;
  seed?: number;
}): SimulationResult {
  const runs = options.runs ?? 1000;
  const horizon = options.months ?? 12;
  const categories = Object.keys(options.historyByCategory).sort();
  const observations = Math.max(
    0,
    ...Object.values(options.historyByCategory).map((values) => values.length),
  );
  const dataSufficiency = observations >= 2 ? "SUFFICIENT" : observations === 1 ? "LOW" : "NONE";
  const reason =
    dataSufficiency === "SUFFICIENT"
      ? `Uses deterministic resampling from ${observations} months of shared category history.`
      : "Not enough history yet; the simulation uses the available run-rate or zero where history is missing.";
  const random = seededRandom(options.seed ?? 1);
  const runSpend = Array.from({ length: runs }, () => Array.from({ length: horizon }, () => 0));
  const runSavings = Array.from({ length: runs }, () => Array.from({ length: horizon }, () => 0));

  for (let run = 0; run < runs; run++) {
    for (let month = 0; month < horizon; month++) {
      let spend = 0;
      for (const categoryId of categories) {
        const values = options.historyByCategory[categoryId] ?? [];
        const selected = values.length ? values[Math.floor(random() * values.length)]! : 0;
        let amount = Math.max(0, Math.round(selected * (0.9 + random() * 0.2)));
        for (const change of options.changes) {
          if (
            change.type === "REDUCE_CATEGORY" &&
            change.categoryId === categoryId &&
            month >= (change.fromMonth ?? 0)
          ) {
            amount = Math.round(amount * (1 - change.percent / 100));
          }
          if (
            change.type === "RECURRING_EXPENSE" &&
            change.categoryId === categoryId &&
            month >= change.startMonth
          ) {
            amount += change.amountPaise;
          }
          if (
            change.type === "ONE_OFF_EXPENSE" &&
            change.categoryId === categoryId &&
            month === change.month
          ) {
            amount += change.amountPaise;
          }
        }
        spend += amount;
      }
      const incomeChange = options.changes
        .filter(
          (change): change is Extract<ScenarioChange, { type: "INCOME_CHANGE" }> =>
            change.type === "INCOME_CHANGE" && month >= change.fromMonth,
        )
        .reduce((sum, change) => sum + change.amountPaise, 0);
      const income = Math.max(0, (options.monthlyIncomePaise ?? 0) + incomeChange);
      runSpend[run]![month] = spend;
      runSavings[run]![month] = income - spend;
    }
  }

  const months = Array.from({ length: horizon }, (_, month): SimulationMonth => {
    const spend = runSpend.map((row) => row[month]!);
    const savings = runSavings.map((row) => row[month]!);
    const budget = options.budgetByMonth?.[month];
    return {
      month,
      spendPaise: {
        p10: percentile(spend, 0.1),
        p50: percentile(spend, 0.5),
        p90: percentile(spend, 0.9),
      },
      probabilityWithinBudget:
        budget === undefined ? null : spend.filter((value) => value <= budget).length / runs,
      projectedSavingsPaise: {
        p10: percentile(savings, 0.1),
        p50: percentile(savings, 0.5),
        p90: percentile(savings, 0.9),
      },
    };
  });
  const cumulative = runSavings.map((row) => row.reduce((sum, value) => sum + value, 0));
  const target = options.changes.find((change) => change.type === "SAVINGS_TARGET")?.amountPaise;
  return {
    months,
    probabilityMeetingSavingsTarget:
      target === undefined ? null : cumulative.filter((value) => value >= target).length / runs,
    cumulativeSavingsRangePaise: {
      p10: percentile(cumulative, 0.1),
      p50: percentile(cumulative, 0.5),
      p90: percentile(cumulative, 0.9),
    },
    dataSufficiency,
    reason,
  };
}
