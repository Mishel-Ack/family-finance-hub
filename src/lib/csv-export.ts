import type { Expense } from "@/types";

function escapeCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function rupeesFromPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const absolute = Math.abs(paise);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function expensesToCsv(expenses: Expense[], includePrivate: boolean): string {
  const header = ["Date", "Description", "Category", "Member", "Amount (INR)", "Visibility"];
  const rows = expenses
    .filter((expense) => expense.visibility === "SHARED" || includePrivate)
    .map((expense) => [
      expense.date,
      expense.description,
      expense.category_name ?? expense.category ?? "",
      expense.member_name_snapshot && !expense.member_id
        ? `Former member (${expense.member_name_snapshot})`
        : expense.family_member,
      rupeesFromPaise(expense.amount_paise),
      expense.visibility === "PRIVATE" ? "PRIVATE (mine)" : "SHARED",
    ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")}`;
}
