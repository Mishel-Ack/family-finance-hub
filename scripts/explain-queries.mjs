import { Prisma, PrismaClient } from "@prisma/client";
import { loadEnv } from "vite";

if (process.env["NODE_ENV"] === "production") {
  throw new Error("Query-plan evaluation is disabled in production.");
}

const fileEnv = loadEnv("development", process.cwd(), "");
const databaseUrl = process.env["DATABASE_URL"] ?? fileEnv["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("Set DATABASE_URL to a local PostgreSQL database.");
}
const databaseHost = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  throw new Error("Query-plan evaluation only runs against a local PostgreSQL database.");
}

process.env["DATABASE_URL"] = databaseUrl;
const prisma = new PrismaClient();

function collectPlanNodes(node, nodes = []) {
  nodes.push({
    type: node["Node Type"],
    relation: node["Relation Name"] ?? null,
    index: node["Index Name"] ?? null,
    actualRows: node["Actual Rows"] ?? null,
    actualLoops: node["Actual Loops"] ?? null,
    sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
    sharedHitBlocks: node["Shared Hit Blocks"] ?? 0,
  });
  for (const child of node["Plans"] ?? []) collectPlanNodes(child, nodes);
  return nodes;
}

try {
  const family = await prisma.family.findFirst({
    where: { name: "Sharma Family" },
    select: { id: true, ownerId: true },
  });
  if (!family) throw new Error("No Sharma Family demo found; seed it before measuring plans.");

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const queries = [
    {
      name: "shared expenses by family and date",
      sql: Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT "id", "amountPaise", "date"
        FROM "Expense"
        WHERE "familyId" = ${family.id}
          AND "visibility" = 'SHARED'
          AND "date" >= ${from}
          AND "date" < ${to}
        ORDER BY "date" DESC
        LIMIT 100
      `,
    },
    {
      name: "recent family activity",
      sql: Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT "id", "createdAt", "type"
        FROM "ActivityLog"
        WHERE "familyId" = ${family.id}
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT 21
      `,
    },
    {
      name: "unread notifications for family owner",
      sql: Prisma.sql`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT "id", "createdAt"
        FROM "Notification"
        WHERE "familyId" = ${family.id}
          AND "userId" = ${family.ownerId}
          AND "readAt" IS NULL
        ORDER BY "createdAt" DESC
        LIMIT 51
      `,
    },
  ];

  for (const query of queries) {
    const [row] = await prisma.$queryRaw(query.sql);
    const [plan] = row?.["QUERY PLAN"] ?? [];
    if (!plan?.Plan) throw new Error(`PostgreSQL returned no plan for ${query.name}.`);
    console.info(
      JSON.stringify({
        query: query.name,
        planningTimeMs: plan["Planning Time"],
        executionTimeMs: plan["Execution Time"],
        nodes: collectPlanNodes(plan.Plan),
      }),
    );
  }
} finally {
  await prisma.$disconnect();
}
