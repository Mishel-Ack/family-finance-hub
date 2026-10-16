import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  (typeof window === "undefined"
    ? new PrismaClient({
        log: ["error"],
      })
    : (undefined as unknown as PrismaClient));

if (typeof process !== "undefined" && process.env?.["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
