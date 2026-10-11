import { normalizeMerchant } from "@/lib/ml/categorizer";

export interface RecurringExpense {
  merchant: string;
  date: string;
  amountPaise: number;
}

export interface RecurringPattern {
  merchant: string;
  intervalDays: number;
  nextExpectedDate: string;
  typicalAmountPaise: number;
  confidence: number;
  priceChanged: boolean;
  possibleForgotten: boolean;
  reason: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : ((sorted[middle - 1] ?? 0) + sorted[middle]!) / 2;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`) / 86400000);
}

function isoDay(day: number): string {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

export function detectRecurring(options: {
  expenses: RecurringExpense[];
  now: Date;
  amountTolerancePercent?: number;
}): RecurringPattern[] {
  const tolerance = options.amountTolerancePercent ?? 0.15;
  const groups = new Map<string, RecurringExpense[]>();
  for (const expense of options.expenses) {
    const key = normalizeMerchant(expense.merchant);
    if (key) groups.set(key, [...(groups.get(key) ?? []), expense]);
  }
  const expectedIntervals = [7, 14, 30, 90, 365];
  const patterns: RecurringPattern[] = [];
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(options.now);
  const todayIso = `${todayParts.find((part) => part.type === "year")?.value}-${todayParts.find((part) => part.type === "month")?.value}-${todayParts.find((part) => part.type === "day")?.value}`;
  const today = dayNumber(todayIso);
  for (const [merchant, expenses] of groups) {
    const rows = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 3) continue;
    const intervals = rows
      .slice(1)
      .map((row, index) => dayNumber(row.date) - dayNumber(rows[index]!.date));
    const intervalMedian = median(intervals);
    const canonical = expectedIntervals.reduce(
      (best, candidate) =>
        Math.abs(candidate - intervalMedian) < Math.abs(best - intervalMedian) ? candidate : best,
      expectedIntervals[0]!,
    );
    const dayTolerance = canonical <= 14 ? 2 : canonical <= 90 ? 5 : 14;
    const matches = intervals.filter((interval) => Math.abs(interval - canonical) <= dayTolerance);
    if (matches.length < Math.max(2, Math.ceil(intervals.length * 0.6))) continue;
    const amounts = rows.map((row) => row.amountPaise);
    const typicalAmount = median(amounts.slice(0, -1));
    const stable = amounts
      .slice(0, -1)
      .every((amount) => Math.abs(amount - typicalAmount) <= typicalAmount * tolerance);
    if (!stable) continue;
    const latestAmount = amounts.at(-1)!;
    const priceChanged = Math.abs(latestAmount - typicalAmount) > typicalAmount * tolerance;
    const nextDay = dayNumber(rows.at(-1)!.date) + canonical;
    const possibleForgotten = today > nextDay + Math.ceil(canonical * 0.5);
    const confidence = Math.min(
      0.99,
      0.55 + rows.length * 0.05 + (matches.length / intervals.length) * 0.2,
    );
    patterns.push({
      merchant,
      intervalDays: canonical,
      nextExpectedDate: isoDay(nextDay),
      typicalAmountPaise: Math.round(typicalAmount),
      confidence,
      priceChanged,
      possibleForgotten,
      reason: `Similar charges from ${merchant} recur about every ${canonical} days${possibleForgotten ? "; the expected charge may have been missed" : ""}.`,
    });
  }
  return patterns.sort((a, b) => a.merchant.localeCompare(b.merchant));
}
