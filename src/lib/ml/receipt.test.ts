import { describe, expect, it } from "vitest";
import { receiptOutputSchema, validateReceiptOutput, verifyReceiptImage } from "@/lib/ml/receipt";

const clock = new Date("2026-10-11T10:00:00.000Z");

function base64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

const output = {
  merchant: "Local Market",
  date: "2026-10-10",
  currency: "INR",
  total: 500,
  tax: 20,
  lineItems: [
    { name: "Groceries", amount: 300 },
    { name: "Household supplies", amount: 200 },
  ],
  confidence: 0.93,
  unreadable: false,
};

describe("receipt draft validation", () => {
  it("checks JPEG, PNG and WebP magic bytes rather than trusting MIME", () => {
    expect(verifyReceiptImage(base64([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toHaveLength(4);
    expect(verifyReceiptImage(base64([0x89, 0x50, 0x4e, 0x47]), "image/png")).toHaveLength(4);
    expect(
      verifyReceiptImage(
        base64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
        "image/webp",
      ),
    ).toHaveLength(12);
    expect(() => verifyReceiptImage(base64([0x89, 0x50, 0x4e, 0x47]), "image/jpeg")).toThrow(
      "does not match",
    );
  });

  it("rejects unsupported, malformed and oversized image data", () => {
    expect(() => verifyReceiptImage("AA==", "image/gif")).toThrow("JPEG, PNG, or WebP");
    expect(() => verifyReceiptImage("not-base64", "image/png")).toThrow();
    const large = btoa(
      `${String.fromCharCode(0x89, 0x50, 0x4e, 0x47)}${"x".repeat(5 * 1024 * 1024)}`,
    );
    expect(() => verifyReceiptImage(large, "image/png")).toThrow("5 MB or smaller");
  });

  it("converts totals and line items to integer paise and flags mismatches above ₹1", () => {
    const parsed = receiptOutputSchema.parse(output);
    expect(validateReceiptOutput(parsed, clock)).toMatchObject({
      totalPaise: 50000,
      taxPaise: 2000,
      totalMismatch: false,
      lineItems: [{ amountPaise: 30000 }, { amountPaise: 20000 }],
    });
    expect(
      validateReceiptOutput(
        receiptOutputSchema.parse({ ...output, lineItems: [{ name: "Item", amount: 498.99 }] }),
        clock,
      ).totalMismatch,
    ).toBe(true);
  });

  it("rejects non-INR, unreadable, future and older-than-two-years receipts", () => {
    expect(() =>
      validateReceiptOutput(receiptOutputSchema.parse({ ...output, currency: "USD" }), clock),
    ).toThrow("Indian rupee");
    expect(() =>
      validateReceiptOutput(receiptOutputSchema.parse({ ...output, unreadable: true }), clock),
    ).toThrow("could not read");
    expect(() =>
      validateReceiptOutput(receiptOutputSchema.parse({ ...output, date: "2026-10-13" }), clock),
    ).toThrow("future");
    expect(() =>
      validateReceiptOutput(receiptOutputSchema.parse({ ...output, date: "2024-10-10" }), clock),
    ).toThrow("two years");
    expect(() =>
      receiptOutputSchema.parse({
        ...output,
        lineItems: Array.from({ length: 51 }, () => ({ name: "x", amount: 1 })),
      }),
    ).toThrow();
  });
});
