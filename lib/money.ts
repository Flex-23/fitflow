import type { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/** Convert a Prisma Decimal (or number/string) to a plain number. */
export function toNumber(value: DecimalLike): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Percentage change between two periods, or null when the baseline is zero —
 * there is no meaningful "% up from nothing".
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Remaining balance = subscription price − total paid. Never negative. */
export function remainingBalance(
  price: DecimalLike,
  payments: { amount: DecimalLike }[]
): number {
  const total = sum(payments.map((p) => toNumber(p.amount)));
  return Math.max(0, toNumber(price) - total);
}
