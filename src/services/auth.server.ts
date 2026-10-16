import { getHeader } from "@/lib/http-utils";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { loginServerSchema, registerServerSchema } from "@/lib/validations";
import { assertSameOrigin } from "@/lib/http-utils";
import { acceptInviteInTransaction, assertInviteAcceptRateLimit } from "@/lib/invite-acceptance";
import { registerWithInviteSchema } from "@/lib/validations";
import { assertRateLimitAvailable, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

function getSessionCookieName(): string {
  if (typeof process !== "undefined" && process.env?.["SESSION_COOKIE_NAME"]) {
    return process.env["SESSION_COOKIE_NAME"];
  }
  return "fb_session";
}

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
  const secret = typeof process !== "undefined" ? process.env?.["JWT_SECRET"] : undefined;
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
  const cookieName = getSessionCookieName();
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`));
  if (!match) return null;

  const token = match.substring(cookieName.length + 1);
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
  if (
    typeof process !== "undefined" &&
    process.env?.["NODE_ENV"] === "test" &&
    cookieHandlerForTests
  ) {
    cookieHandlerForTests();
    return;
  }
  const isProd = typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production";
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(getSessionCookieName(), token, {
    path: "/",
    maxAge: SEVEN_DAYS_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
}

async function clearSessionCookie() {
  if (
    typeof process !== "undefined" &&
    process.env?.["NODE_ENV"] === "test" &&
    cookieHandlerForTests
  ) {
    cookieHandlerForTests();
    return;
  }
  const isProd = typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production";
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(getSessionCookieName(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
}

let registrationFailureForTests: (() => void) | undefined;
let cookieHandlerForTests: (() => void) | undefined;

export function configureAuthTests(options: {
  registrationFailure?: (() => void) | undefined;
  cookieHandler?: (() => void) | undefined;
}) {
  if (typeof process !== "undefined" && process.env?.["NODE_ENV"] !== "test")
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

    await assertRateLimitAvailable(
      `login:${rateLimitKey}`,
      5,
      15 * 60 * 1000,
      "Too many failed login attempts. Please try again in 15 minutes.",
    );

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      await consumeRateLimit(
        `login:${rateLimitKey}`,
        5,
        15 * 60 * 1000,
        "Too many failed login attempts. Please try again in 15 minutes.",
      );
      throw new Error("Invalid email or password");
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      await consumeRateLimit(
        `login:${rateLimitKey}`,
        5,
        15 * 60 * 1000,
        "Too many failed login attempts. Please try again in 15 minutes.",
      );
      throw new Error("Invalid email or password");
    }

    await resetRateLimit(`login:${rateLimitKey}`);

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

export const registerWithInviteFn = createServerFn({ method: "POST" })
  .validator(registerWithInviteSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const parsed = registerWithInviteSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration details");
    }
    await assertInviteAcceptRateLimit(
      getHeader("x-forwarded-for") ?? getHeader("x-real-ip") ?? "unknown",
    );

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing)
      throw new Error("This email is already registered. Sign in to accept the invite.");

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: parsed.data.name,
            email: parsed.data.email,
            passwordHash,
          },
        });
        await acceptInviteInTransaction(tx, {
          token: parsed.data.token,
          userId: user.id,
          userEmail: user.email,
          displayName: user.name,
          leaveExistingFamily: false,
        });
        return user;
      });
      const token = await createSessionToken(result.id);
      await setSessionCookie(token);
      return { id: result.id, name: result.name, email: result.email };
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new Error("This email is already registered.");
      }
      throw error;
    }
  });
