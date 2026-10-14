import { describe, expect, it } from "vitest";
import { extractMetrics, collectToolNumbers, verifyAnswerMetrics } from "./coach-verify";

describe("coach-verify number extraction and integrity", () => {
  it("extracts various Indian rupee formats and percentages", () => {
    const text =
      "Your total spending this month is ₹1,20,000, which is up 15% from last month. You also have 1.2 lakh in savings and Rs 450 on food, plus INR 5,000 for rent and 2.5 crore in investments.";
    const metrics = extractMetrics(text);

    expect(metrics).toContainEqual({
      raw: "₹1,20,000",
      value: 120000,
      kind: "CURRENCY",
    });
    expect(metrics).toContainEqual({
      raw: "15%",
      value: 15,
      kind: "PERCENTAGE",
    });
    expect(metrics).toContainEqual({
      raw: "1.2 lakh",
      value: 120000,
      kind: "CURRENCY",
    });
    expect(metrics).toContainEqual({
      raw: "Rs 450",
      value: 450,
      kind: "CURRENCY",
    });
    expect(metrics).toContainEqual({
      raw: "INR 5,000",
      value: 5000,
      kind: "CURRENCY",
    });
    expect(metrics).toContainEqual({
      raw: "2.5 crore",
      value: 25000000,
      kind: "CURRENCY",
    });
  });

  it("extracts numbers from tool outputs converting paise to rupees", () => {
    const toolResult = {
      totalSpendPaise: 12000000,
      categoryTotals: [
        { name: "Groceries", amountPaise: 45000 },
        { name: "Rent", amountPaise: 500000 },
      ],
      percentIncrease: 15,
    };
    const numbers = collectToolNumbers(toolResult);

    expect(numbers.has(12000000)).toBe(true);
    expect(numbers.has(120000)).toBe(true); // 12,000,000 paise = 1,20,000 rupees
    expect(numbers.has(450)).toBe(true); // 45,000 paise = 450 rupees
    expect(numbers.has(5000)).toBe(true); // 500,000 paise = 5,000 rupees
    expect(numbers.has(15)).toBe(true);
  });

  it("verifies grounded answers successfully", () => {
    const toolResults = [
      {
        totalSpendPaise: 12000000,
        groceriesPaise: 45000,
        changePercent: 15,
      },
    ];
    const answer =
      "You have spent ₹1,20,000 this month, with Rs 450 spent on Groceries, which is 15% higher than usual.";
    const result = verifyAnswerMetrics(answer, toolResults);
    expect(result.valid).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it("flags ungrounded/invented figures as mismatches", () => {
    const toolResults = [
      {
        totalSpendPaise: 12000000,
      },
    ];
    const ungroundedAnswer =
      "You spent ₹1,20,000 this month and ₹99,999 on luxury dining with 42% tax.";
    const result = verifyAnswerMetrics(ungroundedAnswer, toolResults);
    expect(result.valid).toBe(false);
    expect(result.mismatches).toHaveLength(2);
    expect(result.mismatches.map((m) => m.raw)).toContain("₹99,999");
    expect(result.mismatches.map((m) => m.raw)).toContain("42%");
  });
});
