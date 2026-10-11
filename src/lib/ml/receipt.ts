import { z } from "zod";
import { toPaise } from "@/lib/money";
import { dateSchema } from "@/lib/validations";

export const receiptOutputSchema = z.object({
  merchant: z.string().trim().max(100).nullable(),
  date: dateSchema.nullable(),
  currency: z.string().trim().length(3),
  total: z.number().finite().nonnegative(),
  tax: z.number().finite().nonnegative().optional().nullable(),
  lineItems: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        amount: z.number().finite().nonnegative(),
      }),
    )
    .max(50),
  confidence: z.number().min(0).max(1),
  unreadable: z.boolean(),
});

export type ReceiptDraft = {
  merchant: string | null;
  date: string;
  currency: "INR";
  totalPaise: number;
  taxPaise: number | null;
  lineItems: { name: string; amountPaise: number }[];
  totalMismatch: boolean;
  confidence: number;
  categoryId: string | null;
};

export function verifyReceiptImage(base64: string, mediaType: string): Uint8Array {
  if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp") {
    throw new Error("Use a JPEG, PNG, or WebP receipt image");
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Receipt image data is invalid");
  }
  if (binary.length === 0 || binary.length > 5 * 1024 * 1024) {
    throw new Error("Receipt image must be 5 MB or smaller");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const valid = mediaType === "image/jpeg" ? isJpeg : mediaType === "image/png" ? isPng : isWebp;
  if (!valid) throw new Error("Receipt image content does not match its file type");
  return bytes;
}

export function validateReceiptOutput(
  value: z.infer<typeof receiptOutputSchema>,
  now: Date,
): Omit<ReceiptDraft, "categoryId"> {
  if (value.unreadable) throw new Error("We could not read this receipt. Try a clearer image.");
  if (value.currency.toUpperCase() !== "INR")
    throw new Error("Only Indian rupee receipts are supported");
  if (!value.date) throw new Error("Receipt date could not be read");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce(
      (date, part) => {
        if (part.type === "year") date.year = part.value;
        if (part.type === "month") date.month = part.value;
        if (part.type === "day") date.day = part.value;
        return date;
      },
      { year: "", month: "", day: "" },
    );
  const todayIso = `${today.year}-${today.month}-${today.day}`;
  if (value.date > todayIso) throw new Error("Receipt date cannot be in the future");
  const oldest = new Date(`${todayIso}T00:00:00.000Z`);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - 2);
  if (value.date < oldest.toISOString().slice(0, 10))
    throw new Error("Receipt must be less than two years old");
  const totalPaise = toPaise(value.total);
  const lineTotalPaise = value.lineItems.reduce((sum, item) => sum + toPaise(item.amount), 0);
  return {
    merchant: value.merchant,
    date: value.date,
    currency: "INR",
    totalPaise,
    taxPaise: value.tax === null || value.tax === undefined ? null : toPaise(value.tax),
    lineItems: value.lineItems.map((item) => ({
      name: item.name,
      amountPaise: toPaise(item.amount),
    })),
    totalMismatch: Math.abs(lineTotalPaise - totalPaise) > 100,
    confidence: value.confidence,
  };
}
