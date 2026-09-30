import { describe, it, expect, beforeAll } from "vitest";
import { parseSessionFromHeader, createSessionToken } from "@/services/auth.server";
import { can, assertCan } from "@/lib/authz";

describe("Integration Isolation & Auth Tests", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-key-at-least-32-characters-long";
  });

  it("verifies and parses session token correctly", () => {
    const userId = "test-user-id-123";
    const token = createSessionToken(userId);
    const cookieHeader = `fb_session=${token}`;

    const session = parseSessionFromHeader(cookieHeader);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
  });

  it("rejects invalid or missing session cookies", () => {
    expect(parseSessionFromHeader(null)).toBeNull();
    expect(parseSessionFromHeader("fb_session=invalid-token")).toBeNull();
  });

  it("prevents MEMBER role from managing budgets or changing roles", () => {
    expect(can("MEMBER", "budget:manage")).toBe(false);
    expect(() => assertCan("MEMBER", "budget:manage")).toThrow();
  });

  it("prevents VIEWER role from creating or modifying expenses", () => {
    expect(can("VIEWER", "expense:create")).toBe(false);
    expect(() => assertCan("VIEWER", "expense:create")).toThrow();
  });
});
