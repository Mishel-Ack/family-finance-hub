import { describe, expect, it } from "vitest";
import { matchesCommandLabel } from "@/lib/command-filter";

describe("navigation command filtering", () => {
  it("matches only the supplied navigation label and ignores blank searches", () => {
    expect(matchesCommandLabel("Monthly reports", "REPORT")).toBe(true);
    expect(matchesCommandLabel("Monthly reports", "expense description")).toBe(false);
    expect(matchesCommandLabel("Monthly reports", "  ")).toBe(true);
  });
});
