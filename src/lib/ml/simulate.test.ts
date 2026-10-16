import { describe, expect, it } from "vitest";
import { simulateScenario } from "@/lib/ml/simulate";

describe("planner shortfall math", () => {
  it("keeps projected savings negative when monthly spending exceeds income", () => {
    const result = simulateScenario({
      historyByCategory: { groceries: [100_000, 100_000] },
      changes: [],
      monthlyIncomePaise: 10_000,
      runs: 100,
      seed: 10,
    });

    expect(result.months).toHaveLength(12);
    expect(result.months.every((month) => month.projectedSavingsPaise.p90 < 0)).toBe(true);
    expect(result.cumulativeSavingsRangePaise.p90).toBeLessThan(0);
  });
});
