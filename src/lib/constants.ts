export const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Education",
  "Healthcare",
  "Entertainment",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  Food: "var(--chart-1)",
  Transport: "var(--chart-2)",
  Shopping: "var(--chart-3)",
  Bills: "var(--chart-4)",
  Education: "var(--chart-5)",
  Healthcare: "var(--primary)",
  Entertainment: "var(--warning)",
  Other: "var(--muted-foreground)",
};

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const YEARS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i);