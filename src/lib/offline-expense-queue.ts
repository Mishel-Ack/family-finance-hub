import type { ExpenseInput } from "@/types";

const databaseName = "familybudget-offline";
const storeName = "pending-expenses";

export interface PendingExpense {
  key: string;
  familyId: string;
  userId: string;
  input: ExpenseInput & { clientRequestId: string };
  queuedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Offline expense storage is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open offline expense storage."));
  });
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("offline-expense-queue-changed"));
  }
}

export async function enqueueExpense(
  familyId: string,
  userId: string,
  input: ExpenseInput,
): Promise<PendingExpense> {
  const clientRequestId = input.clientRequestId ?? crypto.randomUUID();
  const record: PendingExpense = {
    key: `${userId}:${familyId}:${clientRequestId}`,
    familyId,
    userId,
    input: { ...input, clientRequestId },
    queuedAt: new Date().toISOString(),
  };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not queue the expense for syncing."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline expense queue was interrupted."));
  });
  database.close();
  notifyQueueChanged();
  return record;
}

export async function listQueuedExpenses(familyId: string, userId: string) {
  const database = await openDatabase();
  const records = await new Promise<PendingExpense[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as PendingExpense[]);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not read pending offline expenses."));
  });
  database.close();
  return records
    .filter((record) => record.familyId === familyId && record.userId === userId)
    .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

export async function countQueuedExpenses(familyId: string, userId: string) {
  return (await listQueuedExpenses(familyId, userId)).length;
}

export async function removeQueuedExpense(key: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not remove the synced offline expense."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline expense queue update was interrupted."));
  });
  database.close();
  notifyQueueChanged();
}
