import { logServerFailure } from "@/lib/server-logger";

// Captures the original Error briefly so server.ts can identify swallowed 500s.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

// Keep arbitrary error messages, stacks, request bodies, and AI content out of logs.
console.error = (...args: unknown[]) => {
  const error = args.find(isErrorLike);
  if (error) record(error);
  logServerFailure("server_error", error);
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
