import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumber, sum } from "@/lib/money";
import type { ExpenseCategoryKey } from "@/schemas/finance";

/**
 * Cash reports.
 *
 * Income is counted when money actually changes hands, not when a
 * subscription is sold: every `Payment` row is a real collection (the amount
 * taken at registration, or a later instalment on a deferred balance), and
 * every `DebtPayment` is a debt settlement. Expenses are counted on the day
 * the money left (`spentAt`).
 */

export type ReportTotals = {
  subscriptionIncome: number;
  debtIncome: number;
  totalIncome: number;
  expenses: number;
  net: number;
  /** Profit as a share of income (%), or null when no income came in. */
  margin: number | null;
  /** False when neither money in nor money out happened in the period. */
  hasMovement: boolean;
  paymentsCount: number;
  debtPaymentsCount: number;
  expensesCount: number;
  newMembers: number;
  newSubscriptions: number;
};

export type CategoryTotal = { category: ExpenseCategoryKey; total: number };

export type DayBucket = { date: string; income: number; expenses: number; net: number };

export type Report = ReportTotals & {
  from: string;
  to: string;
  byCategory: CategoryTotal[];
  /** Day-by-day breakdown; one entry per day in the range. */
  days: DayBucket[];
};

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function monthRange(year: number, month: number): { from: Date; to: Date } {
  // `month` is 1-12; day 0 of the next month is the last day of this one.
  return {
    from: startOfDay(new Date(year, month - 1, 1)),
    to: endOfDay(new Date(year, month, 0)),
  };
}

/**
 * The comparable period immediately before this one: yesterday for a day,
 * the previous calendar month for a month (never a fixed 30-day shift, which
 * would compare February against the wrong slice of January).
 */
export function previousRange(
  from: Date,
  to: Date,
  mode: "daily" | "monthly"
): { from: Date; to: Date } {
  if (mode === "monthly") {
    const prev = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    return monthRange(prev.getFullYear(), prev.getMonth() + 1);
  }
  const d = new Date(from.getTime() - 86_400_000);
  return { from: startOfDay(d), to: endOfDay(d) };
}


/** Local YYYY-MM-DD, used as the bucket key (never UTC, which shifts days). */
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getReport(from: Date, to: Date): Promise<Report> {
  const range = { gte: from, lte: to };

  const [payments, debtPayments, expenses, newMembers, newSubscriptions] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: range },
      select: { amount: true, createdAt: true },
    }),
    prisma.debtPayment.findMany({
      where: { createdAt: range },
      select: { amount: true, createdAt: true },
    }),
    prisma.expense.findMany({
      where: { spentAt: range },
      select: { amount: true, spentAt: true, category: true },
    }),
    prisma.member.count({ where: { createdAt: range } }),
    prisma.subscription.count({ where: { createdAt: range } }),
  ]);

  const subscriptionIncome = sum(payments.map((p) => toNumber(p.amount)));
  const debtIncome = sum(debtPayments.map((p) => toNumber(p.amount)));
  const expenseTotal = sum(expenses.map((e) => toNumber(e.amount)));
  const totalIncome = subscriptionIncome + debtIncome;

  // Expenses grouped by category, largest first.
  const catMap = new Map<ExpenseCategoryKey, number>();
  for (const e of expenses) {
    const key = e.category as ExpenseCategoryKey;
    catMap.set(key, (catMap.get(key) ?? 0) + toNumber(e.amount));
  }
  const byCategory = [...catMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // One bucket per day in the range, so gaps render as zeros.
  const days = new Map<string, DayBucket>();
  for (let d = startOfDay(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
    days.set(dayKey(d), { date: dayKey(d), income: 0, expenses: 0, net: 0 });
  }
  const bump = (at: Date, field: "income" | "expenses", value: number) => {
    const b = days.get(dayKey(at));
    if (b) b[field] += value;
  };
  for (const p of payments) bump(p.createdAt, "income", toNumber(p.amount));
  for (const p of debtPayments) bump(p.createdAt, "income", toNumber(p.amount));
  for (const e of expenses) bump(e.spentAt, "expenses", toNumber(e.amount));
  for (const b of days.values()) b.net = b.income - b.expenses;

  const net = totalIncome - expenseTotal;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    subscriptionIncome,
    debtIncome,
    totalIncome,
    expenses: expenseTotal,
    net,
    // Share of income kept as profit. Null when nothing came in, so the UI
    // can say "no movement" instead of showing a meaningless 0%.
    margin: totalIncome > 0 ? (net / totalIncome) * 100 : null,
    hasMovement: totalIncome > 0 || expenseTotal > 0,
    paymentsCount: payments.length,
    debtPaymentsCount: debtPayments.length,
    expensesCount: expenses.length,
    newMembers,
    newSubscriptions,
    byCategory,
    days: [...days.values()],
  };
}

export type Movement = {
  id: string;
  kind: "subscription" | "debt" | "expense";
  /** Who the money came from, or what it was spent on. */
  label: string;
  detail: string | null;
  amount: number;
  at: string;
};

/** Every individual money movement in a period, newest first. */
export async function getMovements(from: Date, to: Date): Promise<Movement[]> {
  const range = { gte: from, lte: to };

  const [payments, debtPayments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: range },
      select: {
        id: true,
        amount: true,
        note: true,
        createdAt: true,
        subscription: {
          select: { planName: true, member: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.debtPayment.findMany({
      where: { createdAt: range },
      select: {
        id: true,
        amount: true,
        note: true,
        createdAt: true,
        debt: { select: { personName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.expense.findMany({
      where: { spentAt: range },
      select: { id: true, title: true, amount: true, category: true, note: true, spentAt: true },
      orderBy: { spentAt: "desc" },
    }),
  ]);

  const rows: Movement[] = [
    ...payments.map((p) => ({
      id: p.id,
      kind: "subscription" as const,
      label: p.subscription.member.name,
      detail: p.note ?? p.subscription.planName,
      amount: toNumber(p.amount),
      at: p.createdAt.toISOString(),
    })),
    ...debtPayments.map((p) => ({
      id: p.id,
      kind: "debt" as const,
      label: p.debt.personName,
      detail: p.note,
      amount: toNumber(p.amount),
      at: p.createdAt.toISOString(),
    })),
    ...expenses.map((e) => ({
      id: e.id,
      kind: "expense" as const,
      label: e.title,
      detail: e.note ?? e.category,
      amount: toNumber(e.amount),
      at: e.spentAt.toISOString(),
    })),
  ];

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** Outstanding money the gym is still owed, across both ledgers. */
export async function getOutstanding(): Promise<{ deferred: number; debts: number }> {
  const [subs, debts] = await Promise.all([
    prisma.subscription.findMany({
      where: { method: "DEFERRED", status: { in: ["ACTIVE", "EXPIRED", "FROZEN"] } },
      select: { price: true, payments: { select: { amount: true } } },
    }),
    prisma.debt.findMany({ select: { amount: true, payments: { select: { amount: true } } } }),
  ]);

  const remaining = (total: unknown, paid: { amount: unknown }[]) =>
    Math.max(0, toNumber(total as never) - sum(paid.map((p) => toNumber(p.amount as never))));

  return {
    deferred: sum(subs.map((s) => remaining(s.price, s.payments))),
    debts: sum(debts.map((d) => remaining(d.amount, d.payments))),
  };
}
