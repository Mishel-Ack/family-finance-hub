import { loadEnv } from "vite";

const fileEnv = loadEnv("test", process.cwd(), "");
const databaseUrl = process.env["DATABASE_URL"] ?? fileEnv["DATABASE_URL"];
const configuredTestUrl = process.env["DATABASE_URL_TEST"] ?? fileEnv["DATABASE_URL_TEST"];

if (!databaseUrl) throw new Error("DATABASE_URL is required to validate the test database target");

function deriveTestDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = `/${name}_test`;
  return url.toString();
}

const testDatabaseUrl = configuredTestUrl ?? deriveTestDatabase(databaseUrl);

function databaseIdentity(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.protocol}//${url.hostname}:${url.port}${decodeURIComponent(url.pathname)}?schema=${url.searchParams.get("schema") ?? "public"}`;
}

if (databaseIdentity(databaseUrl) === databaseIdentity(testDatabaseUrl)) {
  throw new Error("DATABASE_URL_TEST must point to a different database than DATABASE_URL");
}

process.env["DATABASE_URL"] = testDatabaseUrl;
process.env["NODE_ENV"] = "test";
