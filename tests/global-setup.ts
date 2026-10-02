import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnv } from "vite";

export default function setupTestDatabase() {
  const fileEnv = loadEnv("test", process.cwd(), "");
  const databaseUrl = process.env["DATABASE_URL"] ?? fileEnv["DATABASE_URL"];
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required to validate the test database target");
  const testDatabaseUrl =
    process.env["DATABASE_URL_TEST"] ??
    fileEnv["DATABASE_URL_TEST"] ??
    (() => {
      const url = new URL(databaseUrl);
      url.pathname = `/${decodeURIComponent(url.pathname.slice(1))}_test`;
      return url.toString();
    })();
  const identity = (connectionString: string) => {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.hostname}:${url.port}${decodeURIComponent(url.pathname)}?schema=${url.searchParams.get("schema") ?? "public"}`;
  };
  if (identity(databaseUrl) === identity(testDatabaseUrl)) {
    throw new Error("DATABASE_URL_TEST must point to a different database than DATABASE_URL");
  }
  execFileSync(
    process.execPath,
    [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
    },
  );
}
