import { describe, it, expect } from "vitest";
import { toPaise, fromPaise, formatPaiseINR } from "./money";
import { usagePercent, statusFor, remaining } from "./calculations";
import { can } from "./authz";

describe("money.ts unit tests", () => {
  it("converts rupees to paise correctly", () => {
    expect(toPaise(100)).toBe(10000);
    expect(toPaise(49.99)).toBe(4999);
    expect(toPaise(0.01)).toBe(1);
    expect(toPaise(0)).toBe(0);
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
