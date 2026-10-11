import { describe, expect, it } from "vitest";
import { detectAnomalies } from "@/lib/ml/anomaly";
import { backtestPlanningEngine } from "@/lib/ml/backtest";
import { forecastMonth } from "@/lib/ml/forecast";
import { financialHealthScore } from "@/lib/ml/health";
import { detectRecurring } from "@/lib/ml/recurring";
import { simulateScenario } from "@/lib/ml/simulate";

describe("deterministic planning functions", () => {
  it("forecasts with learned daily profile, seeded ranges and sufficiency labels", () => {
    const history = [
      {
        month: "2026-07",
        categories: { food: 10000 },
        cumulativeByDay: { food: [1000, 2000, 3000, 4000, 5000, 10000] },
      },
      {
        month: "2026-08",
        categories: { food: 12000 },
        cumulativeByDay: { food: [1200, 2400, 3600, 4800, 6000, 12000] },
      },
    ];
    const input = {
      history,
      currentSpentByCategory: { food: 4000 },
      dayOfMonth: 3,
      daysInMonth: 30,
      seed: 77,
    };
    const first = forecastMonth(input);
    const second = forecastMonth(input);
    expect(first).toEqual(second);
    expect(first.dataSufficiency).toBe("SUFFICIENT");
    expect(first.categories[0]?.pointPaise).toBeGreaterThan(10000);
    expect(first.total.rangePaise.p10).toBeLessThanOrEqual(first.total.rangePaise.p50);
    expect(first.total.rangePaise.p50).toBeLessThanOrEqual(first.total.rangePaise.p90);
    expect(forecastMonth({ ...input, history: history.slice(0, 1) }).dataSufficiency).toBe("LOW");
    expect(
      forecastMonth({ ...input, history: [], currentSpentByCategory: {} }).dataSufficiency,
    ).toBe("NONE");
  });

  it("flags robust amount outliers, duplicate charges and category spikes with reasons", () => {
    const expenses = Array.from({ length: 12 }, (_, index) => ({
      id: `e${index}`,
      categoryId: "food",
      merchant: "Cafe One",
      amountPaise: index === 11 ? 100000 : 1000,
      date:
        index === 10
          ? "2026-10-10"
          : index === 11
            ? "2026-10-10"
            : `2026-09-${String(index + 1).padStart(2, "0")}`,
    })).concat([
      {
        id: "e12",
        categoryId: "food",
        merchant: "Cafe One",
        amountPaise: 1000,
        date: "2026-10-10",
      },
    ]);
    const flags = detectAnomalies({
      expenses,
      monthlyCategoryTotals: { food: [10000, 11000, 10500, 25000] },
    });
    expect(flags.some((flag) => flag.kind === "CATEGORY_OUTLIER" && flag.expenseId === "e11")).toBe(
      true,
    );
    expect(flags.some((flag) => flag.kind === "MERCHANT_OUTLIER" && flag.expenseId === "e11")).toBe(
      true,
    );
    expect(flags.some((flag) => flag.kind === "LARGE_EXPENSE" && flag.expenseId === "e11")).toBe(
      true,
    );
    expect(flags.some((flag) => flag.kind === "DUPLICATE")).toBe(true);
    expect(flags.some((flag) => flag.kind === "CATEGORY_SPIKE")).toBe(true);
    expect(flags.every((flag) => flag.reason.length > 10)).toBe(true);
    expect(
      detectAnomalies({ expenses: expenses.slice(0, 9) }).some(
        (flag) => flag.kind === "CATEGORY_OUTLIER",
      ),
    ).toBe(false);
  });

  it("detects recurring intervals, amount changes and only labels lapsed bills as possible", () => {
    const expenses = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-10-31"].map(
      (date, index) => ({
        merchant: "Jio Fiber",
        date,
        amountPaise: index === 3 ? 150000 : 120000,
      }),
    );
    const pattern = detectRecurring({ expenses, now: new Date("2026-11-01T10:00:00.000Z") })[0];
    expect(pattern).toMatchObject({
      intervalDays: 30,
      typicalAmountPaise: 120000,
      priceChanged: true,
      possibleForgotten: false,
    });
    expect(pattern?.reason).toContain("recur");
    const lapsed = detectRecurring({ expenses, now: new Date("2026-12-20T10:00:00.000Z") })[0];
    expect(lapsed?.possibleForgotten).toBe(true);
    expect(lapsed?.reason).toContain("may have been missed");
    expect(detectRecurring({ expenses: expenses.slice(0, 2), now: new Date() })).toEqual([]);
  });

  it("simulates seeded what-if scenarios deterministically under 200 ms", () => {
    const input = {
      historyByCategory: { food: [10000, 11000, 12000], transport: [5000, 6000, 5500] },
      changes: [
        { type: "REDUCE_CATEGORY" as const, categoryId: "food", percent: 20 },
        {
          type: "RECURRING_EXPENSE" as const,
          categoryId: "transport",
          amountPaise: 2500,
          startMonth: 1,
        },
        { type: "ONE_OFF_EXPENSE" as const, categoryId: "food", amountPaise: 5000, month: 2 },
        { type: "INCOME_CHANGE" as const, amountPaise: 1000, fromMonth: 2 },
        { type: "SAVINGS_TARGET" as const, amountPaise: 100000 },
      ],
      budgetByMonth: Array(12).fill(20000) as number[],
      monthlyIncomePaise: 30000,
      seed: 55,
    };
    const start = performance.now();
    const first = simulateScenario(input);
    const elapsed = performance.now() - start;
    expect(simulateScenario(input)).toEqual(first);
    expect(first.months).toHaveLength(12);
    expect(first.probabilityMeetingSavingsTarget).not.toBeNull();
    expect(first.dataSufficiency).toBe("SUFFICIENT");
    expect(elapsed).toBeLessThan(200);
    expect(simulateScenario({ historyByCategory: {}, changes: [] }).dataSufficiency).toBe("NONE");
  });

  it("scores only available health inputs and reports missing inputs", () => {
    const partial = financialHealthScore({ monthlySpendPaise: [9000, 11000] });
    expect(partial.score).not.toBeNull();
    expect(partial.components.find((item) => item.key === "savingsRate")?.value).toBeNull();
    expect(partial.confidence).toBe(15);
    const full = financialHealthScore({
      monthlySpendPaise: [9000, 10000, 9500],
      monthlyBudgetPaise: [12000, 12000, 12000],
      monthlyIncomePaise: 20000,
      recurringBillPaise: 4000,
      emergencyFundPaise: 50000,
      essentialMonthlySpendPaise: 10000,
    });
    expect(full.score).toBeGreaterThan(0);
    expect(full.confidence).toBe(100);
    expect(financialHealthScore({ monthlySpendPaise: [] }).score).toBeNull();
  });

  it("backtests only from prior months and reports forecast and anomaly metrics", () => {
    const months = Array.from({ length: 6 }, (_, index) => ({
      month: `2026-0${index + 1}`,
      categories: { food: 10000 + index * 200 },
    }));
    const expenses = Array.from({ length: 12 }, (_, index) => ({
      id: `b${index}`,
      categoryId: "food",
      merchant: "Cafe",
      amountPaise: [
        11_000, 11_000, 12_000, 12_000, 13_000, 13_000, 14_000, 14_000, 15_000, 15_000, 16_000,
        200_000,
      ][index]!,
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    }));
    const result = backtestPlanningEngine({ months, expenses, seededOutlierExpenseIds: ["b11"] });
    expect(result.rows).toHaveLength(4);
    expect(result.maePaise).not.toBeNull();
    expect(result.mapePercent).not.toBeNull();
    expect(result.anomaly.recall).toBe(1);
  });
});
