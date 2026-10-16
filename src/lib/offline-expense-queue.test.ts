import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  clearQueuedExpenses,
  countQueuedExpenses,
  enqueueExpense,
  listQueuedExpenses,
  removeQueuedExpense,
} from "./offline-expense-queue";

const expense = {
  amount: 4.5,
  categoryId: "category-1",
  date: "2026-10-16",
  description: "Milk",
  visibility: "SHARED" as const,
};

describe("offline expense queue", () => {
  beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
  afterEach(() => vi.unstubAllGlobals());

  it("scopes, lists, counts, and removes queued drafts by family and user", async () => {
    const first = await enqueueExpense("family-a", "user-a", {
      ...expense,
      clientRequestId: "request-1",
    });
    await enqueueExpense("family-a", "user-b", { ...expense, clientRequestId: "request-2" });
    await enqueueExpense("family-b", "user-a", { ...expense, clientRequestId: "request-3" });

    expect(await countQueuedExpenses("family-a", "user-a")).toBe(1);
    expect(await listQueuedExpenses("family-a", "user-a")).toEqual([first]);
    await removeQueuedExpense(first.key);
    expect(await listQueuedExpenses("family-a", "user-a")).toEqual([]);
  });

  it("clears only the selected account's drafts and reports how many were removed", async () => {
    await enqueueExpense("family-a", "user-a", { ...expense, clientRequestId: "request-1" });
    await enqueueExpense("family-a", "user-a", { ...expense, clientRequestId: "request-2" });
    await enqueueExpense("family-a", "user-b", { ...expense, clientRequestId: "request-3" });

    expect(await clearQueuedExpenses("family-a", "user-a")).toBe(2);
    expect(await countQueuedExpenses("family-a", "user-a")).toBe(0);
    expect(await countQueuedExpenses("family-a", "user-b")).toBe(1);
  });
});
