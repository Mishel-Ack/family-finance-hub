export interface AnomalyExpense {
  id: string;
  categoryId: string;
  merchant: string;
  amountPaise: number;
  date: string;
}

export interface AnomalyFlag {
  key: string;
  kind: "CATEGORY_OUTLIER" | "MERCHANT_OUTLIER" | "DUPLICATE" | "LARGE_EXPENSE" | "CATEGORY_SPIKE";
  expenseId?: string;
  categoryId?: string;
  merchant?: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function modifiedZScore(value: number, values: number[]): number {
  const center = median(values);
  const mad = median(values.map((sample) => Math.abs(sample - center)));
  if (mad === 0) {
    if (center === 0) return value === 0 ? 0 : 4;
    return value > center * 3 || value < center / 3 ? 4 : 0;
  }
  return (0.6745 * (value - center)) / mad;
}

function merchantKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 80);
}

function timestamp(value: string): number {
  return Date.parse(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

export function detectAnomalies(options: {
  expenses: AnomalyExpense[];
  monthlyCategoryTotals?: Record<string, number[]>;
  minimumObservations?: number;
}): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const minimum = options.minimumObservations ?? 10;
  const categoryGroups = new Map<string, AnomalyExpense[]>();
  const merchantGroups = new Map<string, AnomalyExpense[]>();
  for (const expense of options.expenses) {
    categoryGroups.set(expense.categoryId, [
      ...(categoryGroups.get(expense.categoryId) ?? []),
      expense,
    ]);
    const key = merchantKey(expense.merchant);
    if (key) merchantGroups.set(key, [...(merchantGroups.get(key) ?? []), expense]);
  }

  for (const [categoryId, rows] of categoryGroups) {
    const amounts = rows.map((row) => row.amountPaise);
    if (rows.length >= minimum) {
      for (const row of rows) {
        const score = Math.abs(modifiedZScore(row.amountPaise, amounts));
        if (score > 3.5) {
          flags.push({
            key: `category:${categoryId}:${row.id}`,
            kind: "CATEGORY_OUTLIER",
            expenseId: row.id,
            categoryId,
            severity: score > 6 ? "HIGH" : "MEDIUM",
            reason: `This expense is unusually far from the category's typical amount (${Math.round(score * 10) / 10} robust deviations).`,
          });
        }
      }
    }
    const monthly = options.monthlyCategoryTotals?.[categoryId] ?? [];
    if (monthly.length >= 4) {
      const priorMedian = median(monthly.slice(-4, -1));
      const latest = monthly.at(-1) ?? 0;
      if (priorMedian > 0 && latest >= priorMedian * 1.5) {
        flags.push({
          key: `spike:${categoryId}:${monthly.length}`,
          kind: "CATEGORY_SPIKE",
          categoryId,
          severity: latest >= priorMedian * 2 ? "HIGH" : "MEDIUM",
          reason: `Spending in this category is ${Math.round((latest / priorMedian) * 100)}% of its trailing three-month median.`,
        });
      }
    }
  }

  for (const [merchant, rows] of merchantGroups) {
    const amounts = rows.map((row) => row.amountPaise);
    if (rows.length >= minimum) {
      for (const row of rows) {
        const score = Math.abs(modifiedZScore(row.amountPaise, amounts));
        if (score > 3.5) {
          flags.push({
            key: `merchant:${merchant}:${row.id}`,
            kind: "MERCHANT_OUTLIER",
            expenseId: row.id,
            merchant: rows[0]!.merchant,
            severity: score > 6 ? "HIGH" : "MEDIUM",
            reason: `This amount is unusual for ${rows[0]!.merchant} compared with its past charges.`,
          });
        }
      }
    }
  }

  const sorted = [...options.expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index]!;
    const priorCategory = categoryGroups
      .get(current.categoryId)!
      .filter((row) => row.id !== current.id)
      .map((row) => row.amountPaise);
    if (priorCategory.length >= 5) {
      const center = median(priorCategory);
      const spread = median(priorCategory.map((amount) => Math.abs(amount - center)));
      if (current.amountPaise > Math.max(center * 6, center + 4 * spread)) {
        flags.push({
          key: `large:${current.id}`,
          kind: "LARGE_EXPENSE",
          expenseId: current.id,
          categoryId: current.categoryId,
          severity: current.amountPaise > center * 12 ? "HIGH" : "MEDIUM",
          reason: "This single expense is much larger than usual spending in its category.",
        });
      }
    }
    for (let candidate = index - 1; candidate >= 0; candidate--) {
      const previous = sorted[candidate]!;
      const hours = (timestamp(current.date) - timestamp(previous.date)) / 3_600_000;
      if (hours > 24) break;
      if (
        hours >= 0 &&
        merchantKey(current.merchant) === merchantKey(previous.merchant) &&
        current.amountPaise === previous.amountPaise
      ) {
        flags.push({
          key: `duplicate:${previous.id}:${current.id}`,
          kind: "DUPLICATE",
          expenseId: current.id,
          merchant: current.merchant,
          severity: "HIGH",
          reason: `A matching ${current.merchant} charge with the same amount appears within 24 hours.`,
        });
        break;
      }
    }
  }
  return flags;
}
