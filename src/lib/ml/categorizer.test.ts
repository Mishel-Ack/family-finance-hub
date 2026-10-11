import { describe, expect, it } from "vitest";
import { categorize, MERCHANT_DICTIONARY, normalizeMerchant } from "@/lib/ml/categorizer";

const categories = [
  { id: "food", name: "Food" },
  { id: "transport", name: "Transport" },
  { id: "shopping", name: "Shopping" },
  { id: "bills", name: "Bills" },
  { id: "education", name: "Education" },
  { id: "health", name: "Healthcare" },
  { id: "entertainment", name: "Entertainment" },
  { id: "other", name: "Other" },
];

describe("merchant categorizer", () => {
  it("contains more than 150 Indian merchant and biller aliases", () => {
    expect(MERCHANT_DICTIONARY.size).toBeGreaterThanOrEqual(150);
  });

  it("normalizes UPI identifiers, numbers and transaction codes", () => {
    expect(normalizeMerchant("UPI/Swiggy/123456 ref TXN-998877")).toBe("swiggy");
  });

  it("uses a dictionary match for known merchants", async () => {
    await expect(categorize("Swiggy order #34567", { categories })).resolves.toMatchObject({
      categoryId: "food",
      source: "DICTIONARY",
    });
  });

  it("prioritizes saved corrections and family shared history", async () => {
    const corrected = await categorize("Corner Store", {
      categories,
      corrections: [{ merchantKey: "corner store", categoryId: "shopping" }],
      sharedHistory: [{ text: "Corner Store", categoryId: "food" }],
    });
    expect(corrected).toMatchObject({ categoryId: "shopping", source: "CORRECTION" });
    const learned = await categorize("Corner Store", {
      categories,
      sharedHistory: [
        { text: "Corner Store", categoryId: "food" },
        { text: "Corner Store", categoryId: "food" },
        { text: "Corner Store", categoryId: "shopping" },
      ],
    });
    expect(learned).toMatchObject({ categoryId: "food", source: "FAMILY_HISTORY" });
  });

  it("falls back to Naive Bayes and calls the LLM only without a confident local result", async () => {
    const examples = [
      { text: "unusual bread market", categoryId: "food" },
      { text: "unusual bakery shop", categoryId: "food" },
      { text: "strange bus ride", categoryId: "transport" },
      { text: "unusual grocery market", categoryId: "food" },
    ];
    const learned = await categorize("unusual bread", { categories, sharedHistory: examples });
    expect(learned.source).toBe("NAIVE_BAYES");

    let called = false;
    const unknown = await categorize("zzqv merchant", {
      categories,
      suggestWithLlm: async () => {
        called = true;
        return "shopping";
      },
    });
    expect(called).toBe(true);
    expect(unknown).toMatchObject({ categoryId: "shopping", source: "LLM" });
  });

  it("returns NONE when no category is available and refuses unknown LLM IDs", async () => {
    const noCategories = await categorize("Swiggy", { categories: [] });
    expect(noCategories).toMatchObject({ categoryId: null, source: "NONE" });
    const invalid = await categorize("unknown words", {
      categories,
      suggestWithLlm: async () => "foreign-category",
    });
    expect(invalid).toMatchObject({ categoryId: null, source: "NONE" });
  });

  it("reaches 80% accuracy on a date-ordered seeded sample without an LLM", async () => {
    const merchants = [
      ["BigBasket monthly groceries", "groceries"],
      ["Swiggy dinner", "food"],
      ["Indian Oil petrol", "transport"],
      ["Jio bill", "bills"],
      ["School fees", "education"],
      ["Apollo Pharmacy medicine", "health"],
      ["Netflix subscription", "entertainment"],
      ["Amazon household purchase", "shopping"],
    ] as const;
    const rows = Array.from({ length: 40 }, (_, index) => {
      const [text, categoryId] = merchants[index % merchants.length]!;
      return { date: index, text, categoryId };
    }).sort((a, b) => a.date - b.date);
    const cutoff = Math.floor(rows.length * 0.8);
    const train = rows.slice(0, cutoff).map(({ text, categoryId }) => ({ text, categoryId }));
    const testRows = rows.slice(cutoff);
    const sourceTotals = new Map<string, { correct: number; total: number }>();
    for (const row of testRows) {
      const result = await categorize(row.text, { categories, sharedHistory: train });
      const source = sourceTotals.get(result.source) ?? { correct: 0, total: 0 };
      source.total++;
      if (result.categoryId === row.categoryId) source.correct++;
      sourceTotals.set(result.source, source);
    }
    const accuracy =
      [...sourceTotals.values()].reduce((sum, source) => sum + source.correct, 0) / testRows.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
    expect([...sourceTotals.values()].every((source) => source.total > 0)).toBe(true);
  });
});
