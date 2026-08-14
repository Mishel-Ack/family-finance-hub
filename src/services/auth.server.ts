import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "family-budget-secret-key-2026";
const AUTH_KEY = "fb_user_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  return null;
});

export const loginFn = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    return { id: user.id, name: user.name, email: user.email };
  });

export const registerFn = createServerFn({ method: "POST" })
  .validator((d: { name: string; email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new Error("This email is already registered");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
      },
    });

    // Create default family & membership for new user
    const family = await prisma.family.create({
      data: {
        name: `${data.name}'s Family`,
        ownerId: user.id,
      },
    });

    await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: user.id,
        displayName: data.name,
        role: "OWNER",
      },
    });

    return { id: user.id, name: user.name, email: user.email };
  });
