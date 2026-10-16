import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("AI smoke script", () => {
  it("skips cleanly without a provider key", () => {
    const environment = { ...process.env };
    delete environment["ANTHROPIC_API_KEY"];
    const result = spawnSync(process.execPath, ["scripts/ai-smoke.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ANTHROPIC_API_KEY not set — skipped");
    expect(result.stderr).toBe("");
  });
});
