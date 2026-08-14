export type BudgetStatus = "normal" | "warning" | "critical" | "overspent";

export function usagePercent(spent: number, limit: number): number {
  if (!limit || limit <= 0) return spent > 0 ? 100 : 0;
  return (spent / limit) * 100;
}

export function statusFor(percent: number): BudgetStatus {
  if (percent > 100) return "overspent";
  if (percent > 90) return "critical";
  if (percent >= 70) return "warning";
  return "normal";
}

export const STATUS_META: Record<
  BudgetStatus,
  { label: string; badge: string; bar: string; text: string }
> = {
  normal: {
    label: "On track",
    badge: "bg-success/10 text-success border-success/20",
    bar: "bg-success",
    text: "text-success",
  },
  warning: {
    label: "Watch spending",
    badge: "bg-warning/15 text-warning-foreground border-warning/30",
    bar: "bg-warning",
    text: "text-warning",
  },
  critical: {
    label: "Critical",
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    bar: "bg-destructive",
    text: "text-destructive",
  },
  overspent: {
    label: "Overspent",
    badge: "bg-destructive text-destructive-foreground border-destructive",
    bar: "bg-destructive",
    text: "text-destructive",
  },
};

export function remaining(limit: number, spent: number): number {
  return limit - spent;
}