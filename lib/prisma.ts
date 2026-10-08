import { PrismaClient } from "@prisma/client";

/**
 * The database handle every part of the app imports: one Prisma client on
 * DATABASE_URL, reused across dev reloads.
 */
function singleton(): PrismaClient {
  const g = globalThis as unknown as { __prisma?: PrismaClient };
  if (!g.__prisma) {
    g.__prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return g.__prisma;
}

export const prisma: PrismaClient = singleton();
