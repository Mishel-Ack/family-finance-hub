import { z } from "zod";
import { toPaise } from "@/lib/money";
import { dateSchema } from "@/lib/validations";

export const expenseDraftSchema = z.object({
  amount: z.union([z.number().finite(), z.string().trim().min(1).max(40)]),
  description: z.string().trim().min(1).max(200),
  categoryName: z.string().trim().max(80).nullable(),
  date: dateSchema,
  memberName: z.string().trim().max(80).optional(),
  visibility: z.enum(["SHARED", "PRIVATE"]).optional().default("SHARED"),
});

export const expenseDraftsSchema = z.object({ drafts: z.array(expenseDraftSchema).min(1).max(5) });
export type ParsedExpenseDraft = z.infer<typeof expenseDraftSchema> & {
  amountPaise: number;
  memberId: string | null;
  memberAmbiguous: boolean;
};

function dateInKolkata(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveExpenseDate(text: string, now: Date): string {
  const today = dateInKolkata(now);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const lower = text.toLowerCase();
  if (/\byesterday\b/.test(lower)) return isoDate(new Date(todayDate.getTime() - 86400000));
  if (/\btoday\b/.test(lower)) return today;
  const lastWeekday = lower.match(
    /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (lastWeekday) {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = weekdays.indexOf(lastWeekday[1]!);
    let delta = (todayDate.getUTCDay() - target + 7) % 7;
    if (delta === 0) delta = 7;
    return isoDate(new Date(todayDate.getTime() - delta * 86400000));
  }
  const dayMatch = lower.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day < 1 || day > 31) throw new Error("Enter a valid calendar date");
    const [year, month, currentDay] = today.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - (day <= currentDay! ? 1 : 2), day));
    if (date.getUTCDate() !== day) throw new Error("Enter a valid calendar date");
    return isoDate(date);
  }
  return today;
}

export function parseAmountToken(token: string): { amount: number; amountPaise: number } {
  const normalized = token.toLowerCase().replaceAll(",", "").trim();
  if (normalized.startsWith("-")) throw new Error("Amount must be greater than 0");
  const parts = normalized.match(/^(\d+(?:\.\d+)?)(?:\s*(k|lakh|lakhs))?$/);
  if (!parts) throw new Error("Enter a valid amount");
  const multiplier = parts[2] === "k" ? 1000 : parts[2] ? 100000 : 1;
  const amount = Number(parts[1]) * multiplier;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than 0");
  if (amount > 10_000_000) throw new Error("Amount cannot exceed ₹1 crore");
  return { amount, amountPaise: toPaise(amount) };
}

export function parseExpenseTextRegex(text: string, now: Date): ParsedExpenseDraft | null {
  if (text.length > 500) throw new Error("Text must be 500 characters or fewer");
  const tokens = [
    ...text.matchAll(/(?:₹|rs\.?\s*)?(-?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|lakh|lakhs)?)(?![a-z])/gi),
  ];
  if (tokens.length === 0) return null;
  if (tokens.length > 1) return null;
  const match = tokens[0]!;
  const rawAmount = match[1]!.trim();
  const { amount, amountPaise } = parseAmountToken(rawAmount);
  const date = resolveExpenseDate(text, now);
  const dateAsNumber = Date.parse(`${date}T00:00:00.000Z`);
  const tomorrow = Date.parse(`${dateInKolkata(now)}T00:00:00.000Z`) + 86400000;
  if (dateAsNumber > tomorrow)
    throw new Error("Expense date cannot be more than one day in the future");
  const cleaned = text
    .replace(match[0], " ")
    .replace(/^\s*\/-/, " ")
    .replace(
      /\b(?:yesterday|today|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+the\s+\d{1,2}(?:st|nd|rd|th)?)\b/gi,
      " ",
    )
    .replace(/\bprivate\b/gi, " ")
    .replace(/[|,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return {
    amount,
    amountPaise,
    description: cleaned.slice(0, 200),
    categoryName: null,
    date,
    visibility: /\bprivate\b/i.test(text) ? "PRIVATE" : "SHARED",
    memberId: null,
    memberAmbiguous: false,
  };
}

export function validateModelDrafts(
  drafts: z.infer<typeof expenseDraftsSchema>["drafts"],
  now: Date,
): ParsedExpenseDraft[] {
  const tomorrow = Date.parse(`${dateInKolkata(now)}T00:00:00.000Z`) + 86400000;
  return drafts.map((draft) => {
    const amount =
      typeof draft.amount === "number" ? draft.amount : parseAmountToken(draft.amount).amount;
    if (amount <= 0 || amount > 10_000_000)
      throw new Error("Expense amount is outside the allowed range");
    const amountPaise = toPaise(amount);
    if (Date.parse(`${draft.date}T00:00:00.000Z`) > tomorrow) {
      throw new Error("Expense date cannot be more than one day in the future");
    }
    return {
      ...draft,
      amount,
      amountPaise,
      memberId: null,
      memberAmbiguous: false,
    };
  });
}
