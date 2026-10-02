import { getHeader } from "@/lib/http-utils";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { loginServerSchema, registerServerSchema } from "@/lib/validations";
import { assertSameOrigin } from "@/lib/http-utils";

const SESSION_COOKIE_NAME = process.env["SESSION_COOKIE_NAME"] ?? "fb_session";
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getJwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret || secret.trim() === "") {
    throw new Error("FATAL: JWT_SECRET environment variable is missing.");
  }
  return secret;
}

export interface SessionPayload {
  userId: string;
}

export async function parseSessionFromHeader(
  cookieHeader: string | null | undefined,
): Promise<SessionPayload | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!match) return null;

  const token = match.substring(SESSION_COOKIE_NAME.length + 1);
  try {
    const [header, body, signature, extra] = token.split(".");
    if (!header || !body || !signature || extra) return null;
    const key = await signingKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(`${header}.${body}`),
    );
    if (!valid) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(body)));
    if (
      typeof payload === "object" &&
      payload !== null &&
      "userId" in payload &&
      typeof payload.userId === "string" &&
      "exp" in payload &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now() / 1000
    )
      return { userId: payload.userId };
  } catch {
    return null;
  }
  return null;
}

export async function createSessionToken(userId: string): Promise<string> {
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = encodeBase64Url(
    encoder.encode(
      JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS }),
    ),
  );
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function setSessionCookie(token: string) {
  if (process.env["NODE_ENV"] === "test" && cookieHandlerForTests) {
    cookieHandlerForTests();
    return;
  }
  const isProd = process.env["NODE_ENV"] === "production";
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    maxAge: SEVEN_DAYS_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
}

async function clearSessionCookie() {
  if (process.env["NODE_ENV"] === "test" && cookieHandlerForTests) {
    cookieHandlerForTests();
    return;
  }
  const isProd = process.env["NODE_ENV"] === "production";
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
}

// In-memory rate limiter: 5 failed attempts per email+IP per 15 minutes
// TODO: Replace with Redis for multi-instance production deployments
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) return true;
  if (now > entry.resetAt) {
    rateLimitMap.delete(key);
    return true;
  }
  return entry.count < 5;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const FIFTEEN_MINS = 15 * 60 * 1000;
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + FIFTEEN_MINS });
  } else {
    entry.count += 1;
  }
}

function resetRateLimit(key: string) {
  rateLimitMap.delete(key);
}

export function resetLoginRateLimitForTests() {
  if (process.env["NODE_ENV"] !== "test")
    throw new Error("Rate limit test seam only available in test mode");
  rateLimitMap.clear();
}

let registrationFailureForTests: (() => void) | undefined;
let cookieHandlerForTests: (() => void) | undefined;

export function configureAuthTests(options: {
  registrationFailure?: (() => void) | undefined;
  cookieHandler?: (() => void) | undefined;
}) {
  if (process.env["NODE_ENV"] !== "test")
    throw new Error("Auth test seam only available in test mode");
  registrationFailureForTests = options.registrationFailure;
  cookieHandlerForTests = options.cookieHandler;
}

export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getHeader("cookie");
  const payload = await parseSessionFromHeader(cookieHeader);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true },
  });

  return user;
});

export const loginFn = createServerFn({ method: "POST" })
  .validator(loginServerSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const parsed = loginServerSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid email or password");
    }

    const clientIp = getHeader("x-forwarded-for") || getHeader("x-real-ip") || "unknown-ip";
    const rateLimitKey = `${parsed.data.email}:${clientIp}`;

    if (!checkRateLimit(rateLimitKey)) {
      throw new Error("Too many failed login attempts. Please try again in 15 minutes.");
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      recordFailedAttempt(rateLimitKey);
      throw new Error("Invalid email or password");
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(rateLimitKey);
      throw new Error("Invalid email or password");
    }

    resetRateLimit(rateLimitKey);

    const token = await createSessionToken(user.id);
    await setSessionCookie(token);

    return { id: user.id, name: user.name, email: user.email };
  });

export const registerFn = createServerFn({ method: "POST" })
  .validator(registerServerSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const parsed = registerServerSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration details");
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      throw new Error("This email is already registered");
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
        },
      });

      const family = await tx.family.create({
        data: {
          name: `${parsed.data.name}'s Family`,
          ownerId: user.id,
        },
      });

      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId: user.id,
          displayName: parsed.data.name,
          role: "OWNER",
        },
      });

      registrationFailureForTests?.();

      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((category) => ({
          familyId: family.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          isDefault: true,
        })),
      });

      return user;
    });

    const token = await createSessionToken(result.id);
    await setSessionCookie(token);

    return { id: result.id, name: result.name, email: result.email };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  assertSameOrigin();
  await clearSessionCookie();
  return { success: true };
});
