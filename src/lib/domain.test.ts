import { describe, it, expect } from "vitest";
import { toPaise, fromPaise, formatPaiseINR } from "./money";
import { usagePercent, statusFor, remaining } from "./calculations";
import { can, type Action, type Role } from "./authz";
import { utcCalendarDate } from "./dates";
import { amountSchema } from "./validations";

describe("money.ts unit tests", () => {
  it("converts rupees to paise correctly", () => {
    expect(toPaise(100)).toBe(10000);
    expect(toPaise(49.99)).toBe(4999);
    expect(toPaise(0.01)).toBe(1);
    expect(toPaise(0)).toBe(0);
    expect(() => toPaise(12.345)).toThrow(/2 decimal places/);
  });

  it("handles floating point boundaries and rejects invalid amounts", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(19.99)).toBe(1999);
    expect(() => toPaise(1.005)).toThrow(/2 decimal places/);
    expect(() => toPaise(Number.NaN)).toThrow();
    expect(() => toPaise(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => toPaise(-1)).toThrow();
    expect(amountSchema.safeParse(1e21).success).toBe(false);
  });

  it("converts paise to rupees correctly", () => {
    expect(fromPaise(10000)).toBe(100);
    expect(fromPaise(4999)).toBe(49.99);
    expect(fromPaise(1)).toBe(0.01);
    expect(fromPaise(0)).toBe(0);
  });

  it("formats paise to INR currency string", () => {
    expect(formatPaiseINR(5000000)).toContain("50,000");
    expect(formatPaiseINR(15000)).toContain("150");
  });
});

describe("calculations.ts unit tests", () => {
  it("keeps the last calendar day at UTC midnight", () => {
    const date = utcCalendarDate("2026-09-30");
    expect(date.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(date.toISOString().slice(0, 7)).toBe("2026-09");
  });
  it("computes usage percent correctly", () => {
    expect(usagePercent(500, 1000)).toBe(50);
    expect(usagePercent(1000, 1000)).toBe(100);
    expect(usagePercent(1200, 1000)).toBe(120);
    expect(usagePercent(50, 0)).toBe(100);
  });

  it("returns appropriate budget status for percentages", () => {
    expect(statusFor(50)).toBe("normal");
    expect(statusFor(75)).toBe("warning");
    expect(statusFor(95)).toBe("critical");
    expect(statusFor(110)).toBe("overspent");
  });

  it("computes remaining balance correctly", () => {
    expect(remaining(1000, 400)).toBe(600);
    expect(remaining(1000, 1200)).toBe(-200);
  });
});

describe("authz.ts permission matrix unit tests", () => {
  it("checks every action for every role", () => {
    const roles: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
    const actions: Action[] = [
      "family:delete",
      "family:rename",
      "member:add",
      "member:remove",
      "member:changeRole",
      "member:changeMemberRole",
      "budget:manage",
      "category:manage",
      "expense:create",
      "expense:editAny",
      "expense:editOwn",
      "expense:deleteAny",
      "expense:deleteOwn",
      "readAll",
    ];
    const permissions: Record<Role, Action[]> = {
      OWNER: actions,
      ADMIN: actions.filter(
        (action) => action !== "family:delete" && action !== "member:changeRole",
      ),
      MEMBER: ["expense:create", "expense:editOwn", "expense:deleteOwn", "readAll"],
      VIEWER: ["readAll"],
    };
    for (const role of roles) {
      for (const action of actions) {
        expect(can(role, action), `${role} → ${action}`).toBe(permissions[role].includes(action));
      }
    }
  });

  it("enforces OWNER permissions", () => {
    expect(can("OWNER", "family:delete")).toBe(true);
    expect(can("OWNER", "member:changeRole")).toBe(true);
    expect(can("OWNER", "expense:deleteAny")).toBe(true);
  });

  it("enforces ADMIN permissions", () => {
    expect(can("ADMIN", "family:delete")).toBe(false);
    expect(can("ADMIN", "member:changeRole")).toBe(false);
    expect(can("ADMIN", "budget:manage")).toBe(true);
    expect(can("ADMIN", "expense:deleteAny")).toBe(true);
  });

  it("enforces MEMBER permissions", () => {
    expect(can("MEMBER", "budget:manage")).toBe(false);
    expect(can("MEMBER", "expense:create")).toBe(true);
    expect(can("MEMBER", "expense:editOwn")).toBe(true);
    expect(can("MEMBER", "expense:editAny")).toBe(false);
  });

  it("enforces VIEWER permissions", () => {
    expect(can("VIEWER", "readAll")).toBe(true);
    expect(can("VIEWER", "expense:create")).toBe(false);
    expect(can("VIEWER", "expense:editOwn")).toBe(false);
  });
});
