export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) throw new Error("Enter a valid non-negative amount");
  const fixedDecimal = rupees.toFixed(2);
  const roundedRupees = Number(fixedDecimal);
  if (Math.abs(roundedRupees - rupees) > Number.EPSILON * Math.max(1, Math.abs(rupees)) * 2) {
    throw new Error("Amount cannot have more than 2 decimal places");
  }
  const paise = Math.round(rupees * 100);
  if (!Number.isSafeInteger(paise)) throw new Error("Amount is too large");
  return paise;
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
