import { describe, expect, it } from "vitest";
import { budgetAlertThresholds, daysUntilRecurringReminder } from "./notification-jobs";

describe("notification scheduling rules", () => {
  it("triggers budget notices at 80% and 100% without dividing by a zero budget", () => {
    expect(budgetAlertThresholds(7_999, 10_000)).toEqual([]);
    expect(budgetAlertThresholds(8_000, 10_000)).toEqual([80]);
    expect(budgetAlertThresholds(10_000, 10_000)).toEqual([80, 100]);
    expect(budgetAlertThresholds(20_000, 10_000)).toEqual([80, 100]);
    expect(budgetAlertThresholds(5_000, 0)).toEqual([]);
  });

  it("schedules recurring reminders only from today through three days ahead", () => {
    const today = new Date("2026-10-15T20:00:00.000Z");
    expect(daysUntilRecurringReminder(new Date("2026-10-15T00:00:00.000Z"), today)).toBe(0);
    expect(daysUntilRecurringReminder(new Date("2026-10-18T00:00:00.000Z"), today)).toBe(3);
    expect(daysUntilRecurringReminder(new Date("2026-10-19T00:00:00.000Z"), today)).toBeNull();
    expect(daysUntilRecurringReminder(new Date("2026-10-14T00:00:00.000Z"), today)).toBeNull();
  });
});
