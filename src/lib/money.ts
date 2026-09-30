export const DEFAULT_CATEGORIES = [
  { name: "Housing", color: "#3b82f6", icon: "Home" },
  { name: "Groceries", color: "#10b981", icon: "ShoppingCart" },
  { name: "Utilities", color: "#f59e0b", icon: "Zap" },
  { name: "Transportation", color: "#8b5cf6", icon: "Car" },
  { name: "Healthcare", color: "#ef4444", icon: "Heart" },
  { name: "Entertainment", color: "#ec4899", icon: "Film" },
  { name: "Shopping", color: "#06b6d4", icon: "ShoppingBag" },
  { name: "Other", color: "#6b7280", icon: "MoreHorizontal" },
] as const;

export function toPaise(rupees: number): number {
  if (isNaN(rupees) || !isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  if (isNaN(paise) || !isFinite(paise)) return 0;
  return paise / 100;
}

export function formatPaiseINR(paise: number): string {
  const rupees = fromPaise(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}
