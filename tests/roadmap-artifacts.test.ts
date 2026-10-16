import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("roadmap operational and documentation artifacts", () => {
  it("includes all user-facing technical and operations guides", () => {
    const docs = [
      "docs/architecture.md",
      "docs/demo-script.md",
      "docs/deployment.md",
      "docs/ml-explained.md",
      "docs/operations-runbook.md",
      "docs/test-plan.md",
    ];
    for (const path of docs) expect(statSync(join(root, path)).isFile()).toBe(true);
    const readme = read("README.md");
    for (const path of docs) expect(readme).toContain(`./${path}`);
  });

  it("documents AI controls, the Coach, and measured fixture results", () => {
    const readme = read("README.md");
    expect(readme).toContain("## AI features and Family Coach");
    expect(readme).toContain("npm run ai:smoke");
    expect(readme).toContain("23.49% MAPE");
    expect(readme).toContain("4,668,052 paise MAE");
    expect(read("docs/ml-explained.md")).toContain("tests/demo-seed.integration.test.ts");
  });

  it("configures the documented Render jobs and CI quality gates", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("prisma migrate deploy");
    const render = read("render.yaml");
    expect(render).toContain("familybudget-insights");
    expect(render).toContain("familybudget-notifications");
    expect(render).toContain("prisma migrate deploy");
    expect(render).toContain("healthCheckPath: /api/health");
    const workflow = read(".github/workflows/ci.yml");
    for (const check of ["npm run lint", "npx tsc --noEmit", "npm test", "npm run build"]) {
      expect(workflow).toContain(check);
    }
  });
});
