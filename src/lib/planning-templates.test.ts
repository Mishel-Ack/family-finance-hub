import { describe, expect, it } from "vitest";
import { SINKING_FUND_TEMPLATES } from "@/lib/planning-templates";

describe("sinking fund templates", () => {
  it("provides the festival and school-fee presets shown by the planner", () => {
    expect(SINKING_FUND_TEMPLATES).toEqual([
      { label: "Diwali template", name: "Diwali" },
      { label: "School fees template", name: "School fees" },
    ]);
  });
});
