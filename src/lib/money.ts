export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new Error("Enter a valid amount");
  if (Math.round(rupees * 100) / 100 !== rupees) {
    throw new Error("Amount cannot have more than 2 decimal places");
  }
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
