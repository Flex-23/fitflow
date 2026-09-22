import { PrismaClient } from "@prisma/client";

/**
 * Prisma client for the workers that run on the gym computer.
 *
 * They connect through DIRECT_URL (Postgres session mode) rather than the
 * transaction pooler the hosted app uses. Measured against a Supabase project
 * one continent away, the same `SELECT 1` costs ~1.5 s through the pooler and
 * ~0.45 s direct: transaction mode adds round trips, and every round trip is
 * expensive over that distance. The gate bridge spends one query per card
 * tap, so this is the difference between a turnstile that feels instant and
 * one that hesitates.
 *
 * Only a couple of long-lived processes use this, so they cannot exhaust the
 * database's direct connection slots the way a crowd of serverless instances
 * would — which is exactly why the hosted app must keep using the pooler.
 */
export function workerPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: ["error"],
  });
}
