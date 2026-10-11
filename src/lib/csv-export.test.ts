import { describe, expect, it } from "vitest";
import { expensesToCsv } from "@/lib/csv-export";
import type { Expense } from "@/types";

const row = (
  id: string,
  description: string,
  visibility: Expense["visibility"],
  amountPaise: number,
): Expense => ({
  id,
  family_id: "family",
  user_id: "user",
  member_id: null,
  amount_paise: amountPaise,
  amount: amountPaise / 100,
  category_id: "category",
  category_name: "Food",
  date: "2026-10-01",
  description,
  family_member: "Me",
  visibility,
});

describe("expense CSV export", () => {
  it("prefixes formula-like cells, quotes CSV syntax, includes UTF-8 BOM, and formats paise exactly", () => {
    const csv = expensesToCsv([row("1", "=1+1, note", "SHARED", 10005)], false);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=1+1, note");
    expect(csv).toContain("100.05");
    expect(csv).toContain('"\'=1+1, note"');
  });

  it("never includes private rows unless explicitly requested", () => {
    const expenses = [
      row("shared", "Shared", "SHARED", 100),
      row("private", "Personal", "PRIVATE", 999999),
    ];
    expect(expensesToCsv(expenses, false)).not.toContain("Personal");
    const ownCsv = expensesToCsv(expenses, true);
    expect(ownCsv).toContain("Personal");
    expect(ownCsv).toContain("PRIVATE (mine)");
  });
});
