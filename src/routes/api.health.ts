import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma";

const expectedLatestMigration = "20261015110000_recurring_schedule_fields";

export async function getHealthResponse() {
  const candidateVersion = process.env["RENDER_GIT_COMMIT"];
  const version =
    candidateVersion && /^[a-f0-9]{7,40}$/i.test(candidateVersion)
      ? candidateVersion.slice(0, 12)
      : "development";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return Response.json(
      {
        status: "error",
        database: "unavailable",
        version,
        migrations: { status: "unavailable" },
      },
      { status: 503 },
    );
  }
  try {
    const [migration] = await prisma.$queryRaw<
      Array<{ latestApplied: string | null; unfinishedMigrations: number }>
    >`
      SELECT
        MAX("migration_name") FILTER (
          WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ) AS "latestApplied",
        COUNT(*) FILTER (
          WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
        )::int AS "unfinishedMigrations"
      FROM "_prisma_migrations"
    `;
    const upToDate =
      migration?.latestApplied === expectedLatestMigration && migration.unfinishedMigrations === 0;
    return Response.json(
      {
        status: upToDate ? "ok" : "degraded",
        database: "connected",
        version,
        migrations: {
          status: upToDate ? "up_to_date" : "pending_or_failed",
          latestApplied: migration?.latestApplied ?? null,
          unfinished: migration?.unfinishedMigrations ?? 0,
        },
      },
      { status: upToDate ? 200 : 503 },
    );
  } catch {
    return Response.json(
      {
        status: "degraded",
        database: "connected",
        version,
        migrations: { status: "unavailable" },
      },
      { status: 503 },
    );
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: getHealthResponse,
    },
  },
});
