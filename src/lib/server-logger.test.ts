import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerFailure, withRequestId } from "./server-logger";

describe("server logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs request context and error metadata without exception messages", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    withRequestId("request-123", () => {
      logServerFailure("request_failed", new Error("private token abc123"));
    });

    expect(write).toHaveBeenCalledOnce();
    const output = String(write.mock.calls[0]?.[0]);
    expect(output).toContain('"requestId":"request-123"');
    expect(output).toContain('"errorType":"Error"');
    expect(output).not.toContain("private token abc123");
  });
});
