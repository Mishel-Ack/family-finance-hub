import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(process.cwd(), "src");
const readQueryPattern =
  /\.(?:expense)\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\s*\(/g;
const activityQueryPattern =
  /\.activityLog\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|count|groupBy|aggregate|create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

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
});
