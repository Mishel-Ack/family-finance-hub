import { getRequestHeader } from "@tanstack/react-start/server";
import { httpError } from "@/lib/http-error";

let testHeaders: Record<string, string | undefined> | undefined;

export function setHeadersForTests(headers: Record<string, string | undefined> | undefined) {
  if (process.env["NODE_ENV"] !== "test")
    throw new Error("Header test seam only available in test mode");
  testHeaders = headers;
}

export function getHeader(name: string): string | undefined {
  if (testHeaders) return testHeaders[name.toLowerCase()];
  return getRequestHeader(name.toLowerCase() as Parameters<typeof getRequestHeader>[0]);
}

export function assertSameOrigin() {
  const originHeader = getHeader("origin");
  const configuredOrigin = process.env["APP_ORIGIN"];
  const forwardedHost = getHeader("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || getHeader("host");
  const forwardedProto = getHeader("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || (process.env["NODE_ENV"] === "production" ? "https" : "http");
  try {
    if (!originHeader) throw new Error("missing Origin");
    const origin = new URL(originHeader).origin;
    const expected = configuredOrigin
      ? new URL(configuredOrigin).origin
      : new URL(`${protocol}://${host}`).origin;
    if (origin !== expected) throw new Error("origin mismatch");
  } catch {
    throw httpError("Request origin is not allowed", 403);
  }
}
