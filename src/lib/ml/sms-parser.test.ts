import { describe, expect, it } from "vitest";
import { maskBankMessage, parseBankMessages } from "@/lib/ml/sms-parser";

const now = new Date("2026-10-11T10:00:00.000Z");

describe("bank message parser", () => {
  it("classifies 20 fictional Indian bank, UPI, card, ATM, credit, OTP and promo messages", () => {
    const messages = [
      "A/c XX1234 debited by INR 1,250.00 at Swiggy on 10-10-2026 Ref: AX12345",
      "Rs. 499.00 spent at Netflix on 09-10-2026 from card XX9988",
      "INR 250 paid to Zomato on 08-10-2026 UPI Ref 883300",
      "Your account debited with Rs 2,400 at BigBasket on 07-10-2026",
      "INR 900 withdrawn from ATM on 06-10-2026 at SBI ATM",
      "UPI/P2A/335577/Amazon/paid Rs 1,500 on 05-10-2026",
      "Rs 89.50 debited at Uber on 04-10-2026",
      "INR 399 purchase at Spotify on 03-10-2026",
      "Rs 2,000 transferred to Airtel on 02-10-2026",
      "Card transaction INR 5,200 at DMart on 01-10-2026 debited",
      "INR 1,100 credited to your account on 10-10-2026",
      "Salary credited Rs 50,000 on 01-10-2026",
      "Refund credited INR 500 on 10-10-2026",
      "Your OTP for payment is 123456. Do not share it.",
      "Your verification code is 789012",
      "Festival offer: get cashback, click here",
      "Promo: 20 percent cashback on your next purchase",
      "A/c 123456789012 debited INR 1,999 at Flipkart on 30-09-2026 UTR 987654",
      "UPI payment debited Rs 299 to Jio on 29-09-2026",
      "Rs 350 POS debit at Apollo Pharmacy on 28-09-2026",
    ];
    const result = parseBankMessages({ familyId: "family-a", messages, now });
    expect(result.items).toHaveLength(20);
    expect(result.items.filter((item) => item.classification === "DEBIT")).toHaveLength(13);
    expect(result.items.filter((item) => item.classification === "CREDIT_SKIPPED")).toHaveLength(3);
    expect(result.items.filter((item) => item.classification === "IGNORED")).toHaveLength(4);
    expect(result.items[0]).toMatchObject({
      amountPaise: 125000,
      date: "2026-10-10",
      merchant: "Swiggy",
    });
    expect(JSON.stringify(result.items)).not.toContain("123456789012");
  });

  it("masks phone, account, UPI ID and reference values before model fallback", () => {
    const masked = maskBankMessage(
      "UPI abc@example.com phone +919876543210 A/c 123456789012 Ref: XYZ9988",
    );
    expect(masked).not.toContain("abc@example.com");
    expect(masked).not.toContain("9876543210");
    expect(masked).not.toContain("123456789012");
    expect(masked).not.toContain("XYZ9988");
    expect(masked).toContain("[MASKED_PHONE]");
    expect(masked).toContain("[MASKED_ACCOUNT]");
  });

  it("deduplicates the same message within a paste and across later pastes using only a hash", () => {
    const message = "INR 500 debited at Swiggy on 10-10-2026 Ref: ORDER123";
    const first = parseBankMessages({ familyId: "family-a", messages: [message, message], now });
    expect(first.items.map((item) => item.duplicate)).toEqual([false, true]);
    const known = new Set([first.items[0]!.fingerprint!]);
    const second = parseBankMessages({
      familyId: "family-a",
      messages: [message],
      now,
      knownFingerprints: known,
    });
    expect(second.items[0]?.duplicate).toBe(true);
    expect(first.items[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("enforces the message count and total character limit", () => {
    expect(() => parseBankMessages({ familyId: "f", messages: Array(21).fill("x"), now })).toThrow(
      "1 and 20",
    );
    expect(() => parseBankMessages({ familyId: "f", messages: ["x".repeat(3001)], now })).toThrow(
      "3,000",
    );
  });
});
