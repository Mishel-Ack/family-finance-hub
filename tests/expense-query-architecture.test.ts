import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(process.cwd(), "src");
const readQueryPattern =
  /\.(?:expense)\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\s*\(/g;
const activityQueryPattern =
  /\.activityLog\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const aiUsageQueryPattern =
  /\.aiUsage\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const correctionQueryPattern =
  /\.categoryCorrection\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const fingerprintQueryPattern =
  /\.importFingerprint\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const insightModelQueryPattern =
  /\.(?:insight|incomeProfile|insightFeedback)\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const familyAssetQueryPattern =
  /\.(?:sinkingFund|fundContribution|goal)\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const monthlyReportQueryPattern =
  /\.monthlyReport\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const purchaseRequestQueryPattern =
  /\.purchaseRequest\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const notificationQueryPattern =
  /\.(?:notification|notificationPreference)\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("expense query choke point", () => {
  it("keeps Expense read queries centralized in expense-queries.ts", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter((path) => relative(srcRoot, path).replaceAll("\\", "/") !== "lib/expense-queries.ts")
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        const matches = [...contents.matchAll(readQueryPattern)];
        return matches.map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps ActivityLog reads and writes centralized in activity-queries.ts", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter((path) => relative(srcRoot, path).replaceAll("\\", "/") !== "lib/activity-queries.ts")
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(activityQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps AiUsage access family-scoped in the AI service", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter((path) => relative(srcRoot, path).replaceAll("\\", "/") !== "services/ai.ts")
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(aiUsageQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps category correction access family-scoped in the categorization service", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter(
        (path) => relative(srcRoot, path).replaceAll("\\", "/") !== "services/categorization.ts",
      )
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(correctionQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps import fingerprint access family-scoped in the fingerprint query helper", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter(
        (path) =>
          relative(srcRoot, path).replaceAll("\\", "/") !== "lib/import-fingerprint-queries.ts",
      )
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(fingerprintQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps Insight and InsightFeedback access in the insights service", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter(
        (path) =>
          !["services/insights.ts", "services/planner.ts"].includes(
            relative(srcRoot, path).replaceAll("\\", "/"),
          ),
      )
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(insightModelQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps sinking fund, contribution and goal access in the planning service", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter(
        (path) => relative(srcRoot, path).replaceAll("\\", "/") !== "services/planning-assets.ts",
      )
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(familyAssetQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps monthly report access in the family story service", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter(
        (path) => relative(srcRoot, path).replaceAll("\\", "/") !== "services/family-story.ts",
      )
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(monthlyReportQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps purchase request reads and writes in the purchase request service", () => {
    const offenders = typescriptFiles(srcRoot)
      .filter(
        (path) => relative(srcRoot, path).replaceAll("\\", "/") !== "services/purchase-requests.ts",
      )
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(purchaseRequestQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });

  it("keeps notification access behind the notification service or creation helper", () => {
    const allowed = ["services/notifications.ts", "lib/notifications.ts"];
    const offenders = typescriptFiles(srcRoot)
      .filter((path) => !allowed.includes(relative(srcRoot, path).replaceAll("\\", "/")))
      .flatMap((path) => {
        const contents = readFileSync(path, "utf8");
        return [...contents.matchAll(notificationQueryPattern)].map(
          (match) =>
            `${relative(srcRoot, path)}:${contents.slice(0, match.index).split("\n").length}`,
        );
      });
    expect(offenders).toEqual([]);
  });
});
