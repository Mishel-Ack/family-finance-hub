import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { getHealthResponse } from "@/routes/api.health";

describe("health endpoint", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValueOnce([]);
  });

  it("reports the app version and current migration status", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        latestApplied: "20261015110000_recurring_schedule_fields",
        unfinishedMigrations: 0,
      },
    ]);
    const response = await getHealthResponse();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "ok",
      database: "connected",
      migrations: { status: "up_to_date", unfinished: 0 },
    });
  });

  it("returns degraded status when migrations are unfinished", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        latestApplied: "20261015110000_recurring_schedule_fields",
        unfinishedMigrations: 1,
      },
    ]);
    const response = await getHealthResponse();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      database: "connected",
      migrations: { status: "pending_or_failed", unfinished: 1 },
    });
  });

  it("distinguishes database failure from migration metadata failure", async () => {
    queryRaw.mockReset();
    queryRaw.mockRejectedValueOnce(new Error("sensitive connection string"));
    const databaseResponse = await getHealthResponse();
    expect(databaseResponse.status).toBe(503);
    await expect(databaseResponse.json()).resolves.toMatchObject({
      status: "error",
      database: "unavailable",
    });

    queryRaw.mockReset();
    queryRaw.mockResolvedValueOnce([]);
    queryRaw.mockRejectedValueOnce(new Error("sensitive database details"));
    const migrationResponse = await getHealthResponse();
    expect(migrationResponse.status).toBe(503);
    await expect(migrationResponse.json()).resolves.toMatchObject({
      status: "degraded",
      database: "connected",
      migrations: { status: "unavailable" },
    });
  });
});
