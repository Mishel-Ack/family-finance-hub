import { getHeader, setHeader } from "@/lib/http-utils";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "fb_session";
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error("FATAL: JWT_SECRET environment variable is missing.");
  }
  return secret;
}

export interface SessionPayload {
  userId: string;
}

export function parseSessionFromHeader(cookieHeader: string | null | undefined): SessionPayload | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!match) return null;

  const token = match.substring(SESSION_COOKIE_NAME.length + 1);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as SessionPayload;
    if (payload && typeof payload.userId === "string") {
      return payload;
    }
  } catch {
    return null;
  }
  return null;
}

export function createSessionToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: "7d" });
}

export function setSessionCookie(token: string) {
  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${SEVEN_DAYS_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) {
    cookieOptions.push("Secure");
  }
  setHeader("Set-Cookie", cookieOptions.join("; "));
}

export function clearSessionCookie() {
  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) {
    cookieOptions.push("Secure");
  }
  setHeader("Set-Cookie", cookieOptions.join("; "));
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

const serverRegisterSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().trim().transform((val) => val.toLowerCase()).pipe(z.string().email("Enter a valid email")).pipe(z.string().max(255)),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const serverLoginSchema = z.object({
  email: z.string().trim().transform((val) => val.toLowerCase()).pipe(z.string().email("Enter a valid email")).pipe(z.string().max(255)),
  password: z.string().min(1, "Password is required").max(72),
});

export const getSessionFn = async () => {
  const cookieHeader = getHeader("cookie");
  const payload = parseSessionFromHeader(cookieHeader);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true },
  });

  return user;
};

export const loginFn = async (data: z.infer<typeof serverLoginSchema>) => {
  const parsed = serverLoginSchema.safeParse(data);
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

  const token = createSessionToken(user.id);
  setSessionCookie(token);

  return { id: user.id, name: user.name, email: user.email };
};

export const registerFn = async (data: z.infer<typeof serverRegisterSchema>) => {
  const parsed = serverRegisterSchema.safeParse(data);
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

    return user;
  });

  const token = createSessionToken(result.id);
  setSessionCookie(token);

  return { id: result.id, name: result.name, email: result.email };
};

export const logoutFn = async () => {
  clearSessionCookie();
  return { success: true };
};
