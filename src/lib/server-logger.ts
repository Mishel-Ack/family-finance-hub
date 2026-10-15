import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requestIds = new AsyncLocalStorage<string>();

export function requestIdFor() {
  return randomUUID();
}

export function withRequestId<T>(requestId: string, operation: () => T): T {
  return requestIds.run(requestId, operation);
}

export function logServerFailure(event: string, error: unknown) {
  const statusValue =
    error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : error && typeof error === "object" && "status" in error
        ? error.status
        : undefined;
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      event,
      requestId: requestIds.getStore() ?? "startup",
      errorType: error instanceof Error ? error.name : typeof error,
      ...(typeof statusValue === "number" ? { statusCode: statusValue } : {}),
    })}\n`,
  );
}
