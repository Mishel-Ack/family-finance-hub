import { createHash } from "node:crypto";
import { toPaise } from "@/lib/money";

export type BankMessageClassification = "DEBIT" | "CREDIT_SKIPPED" | "IGNORED" | "UNPARSED";
export interface BankMessageDraft {
  classification: BankMessageClassification;
  amountPaise: number | null;
  merchant: string | null;
  description: string;
  date: string | null;
  fingerprint: string | null;
  duplicate: boolean;
  source: "REGEX" | "LLM";
}

export function maskBankMessage(message: string): string {
  return message
    .replace(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g, "[MASKED_PHONE]")
    .replace(/\b(?:\d[ -]?){8,}\b/g, "[MASKED_ACCOUNT]")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\b/gi, "[MASKED_UPI_ID]")
    .replace(
      /\b(?:ref(?:erence)?|rrn|utr|txn(?:\s?id)?)[=:#\s-]*[a-z0-9-]+\b/gi,
      "[MASKED_REFERENCE]",
    );
}

function todayInKolkata(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function messageDate(message: string, now: Date): string | null {
  const match = message.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (!match) return todayInKolkata(now);
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]!.length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function merchantFromMessage(message: string): string | null {
  const after = message.match(/\b(?:at|to|merchant)\s+([a-z][a-z0-9& .'-]{1,60})/i)?.[1];
  const segment =
    after ??
    message.match(
      /\bUPI\s*[/:-]\s*(?:P2[AMP]|P2P|PAY)\s*[/:-]\s*[^/]+\s*[/:-]\s*([a-z][a-z0-9 &.-]{1,50})/i,
    )?.[1];
  if (!segment) return null;
  const cleaned = segment
    .split(/\b(?:on|ref|rrn|utr|txn|from|a\/c|account|ending|using)\b/i)[0]!
    .trim();
  return cleaned.replace(/[.\s-]+$/, "").slice(0, 80) || null;
}

function fingerprint(
  familyId: string,
  amountPaise: number,
  date: string,
  identity: string,
): string {
  return createHash("sha256")
    .update([familyId, amountPaise, date, identity.toLowerCase().trim()].join("|"))
    .digest("hex");
}

export function parseBankMessages(options: {
  familyId: string;
  messages: string[];
  now: Date;
  knownFingerprints?: ReadonlySet<string>;
}): { items: BankMessageDraft[]; maskedMessages: string[] } {
  if (options.messages.length < 1 || options.messages.length > 20) {
    throw new Error("Paste between 1 and 20 bank messages");
  }
  if (
    options.messages.some((message) => message.length > 3000) ||
    options.messages.join("\n").length > 3000
  ) {
    throw new Error("Bank messages must be 3,000 characters or fewer in total");
  }
  const seen = new Set(options.knownFingerprints ?? []);
  const maskedMessages = options.messages.map(maskBankMessage);
  const items = options.messages.map((message): BankMessageDraft => {
    const lower = message.toLowerCase();
    if (
      /\botp\b|one.?time password|verification code|\bpromo(?:tion)?\b|offer|cashback.*(?:claim|click)/i.test(
        lower,
      )
    ) {
      return {
        classification: "IGNORED",
        amountPaise: null,
        merchant: null,
        description: "",
        date: null,
        fingerprint: null,
        duplicate: false,
        source: "REGEX",
      };
    }
    if (/\b(?:credited|credit|received|deposit|refund|reversal)\b/.test(lower)) {
      return {
        classification: "CREDIT_SKIPPED",
        amountPaise: null,
        merchant: null,
        description: "",
        date: messageDate(message, options.now),
        fingerprint: null,
        duplicate: false,
        source: "REGEX",
      };
    }
    if (
      !/\b(?:debited|debit|spent|paid|purchase|withdrawn|transferred|sent|pos|upi|dr\.)\b/.test(
        lower,
      )
    ) {
      return {
        classification: "UNPARSED",
        amountPaise: null,
        merchant: null,
        description: "",
        date: null,
        fingerprint: null,
        duplicate: false,
        source: "REGEX",
      };
    }
    const currencyAmount = message.match(/(?:\bINR\b|\bRs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    const bareAmount = message.match(
      /(?<![A-Za-z0-9])([\d,]+(?:\.\d{1,2})?)\s*(?:INR|debited|credited)/i,
    );
    const amountMatch = currencyAmount ?? bareAmount;
    const amountText = amountMatch?.[1];
    const merchant = merchantFromMessage(message);
    const date = messageDate(message, options.now);
    if (!amountText || !merchant || !date) {
      return {
        classification: "UNPARSED",
        amountPaise: null,
        merchant,
        description: merchant ?? "",
        date,
        fingerprint: null,
        duplicate: false,
        source: "REGEX",
      };
    }
    let amountPaise: number;
    try {
      amountPaise = toPaise(Number(amountText.replaceAll(",", "")));
    } catch {
      return {
        classification: "UNPARSED",
        amountPaise: null,
        merchant,
        description: merchant,
        date,
        fingerprint: null,
        duplicate: false,
        source: "REGEX",
      };
    }
    if (amountPaise <= 0) {
      return {
        classification: "UNPARSED",
        amountPaise: null,
        merchant,
        description: merchant,
        date,
        fingerprint: null,
        duplicate: false,
        source: "REGEX",
      };
    }
    const reference = message.match(
      /\b(?:ref(?:erence)?|rrn|utr|txn(?:\s?id)?)[=:#\s-]*([a-z0-9-]+)\b/i,
    )?.[1];
    const id = reference ? `ref:${reference}` : `merchant:${merchant}`;
    const hash = fingerprint(options.familyId, amountPaise, date, id);
    const duplicate = seen.has(hash);
    seen.add(hash);
    return {
      classification: "DEBIT",
      amountPaise,
      merchant,
      description: merchant,
      date,
      fingerprint: hash,
      duplicate,
      source: "REGEX",
    };
  });
  return { items, maskedMessages };
}

export function createImportFingerprint(
  familyId: string,
  amountPaise: number,
  date: string,
  merchant: string,
): string {
  return fingerprint(familyId, amountPaise, date, `merchant:${merchant}`);
}
