import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { toNumber, sum, remainingBalance } from "@/lib/money";
import { pageFrom, pageSlice, pageInfo } from "@/lib/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { DebtsManager } from "@/components/manager/debts-manager";

export const metadata: Metadata = { title: "Debts" };

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole("MANAGER");
  const { q, page } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const where = q
    ? { OR: [{ personName: { contains: q } }, { phone: { contains: q } }] }
    : undefined;
  const current = pageFrom(page);

  const [total, raw, allForTotals] = await Promise.all([
    prisma.debt.count({ where }),
    prisma.debt.findMany({
      where,
      include: { payments: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
      ...pageSlice(current),
    }),
    // Headline figures cover every debt, not just the visible page.
    prisma.debt.findMany({ select: { amount: true, payments: { select: { amount: true } } } }),
  ]);
  const paging = pageInfo(current, total);

  const totals = allForTotals.reduce(
    (acc, d) => {
      const paid = sum(d.payments.map((p) => toNumber(p.amount)));
      const remaining = remainingBalance(d.amount, d.payments);
      acc.outstanding += remaining;
      acc.collected += paid;
      if (remaining > 0) acc.people += 1;
      return acc;
    },
    { outstanding: 0, collected: 0, people: 0 }
  );

  const rows = raw.map((d) => ({
    id: d.id,
    personName: d.personName,
    phone: d.phone,
    amount: toNumber(d.amount),
    paid: sum(d.payments.map((p) => toNumber(p.amount))),
    remaining: remainingBalance(d.amount, d.payments),
    note: d.note,
    createdAt: d.createdAt.toISOString(),
    payments: d.payments.map((p) => ({
      id: p.id,
      amount: toNumber(p.amount),
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    })),
  }));

  return (
    <div>
      <PageHeader title={dict.finance.debtsTitle} description={dict.finance.debtsSubtitle} />
      <DebtsManager rows={rows} totals={totals} paging={paging} dict={dict} locale={locale} />
    </div>
  );
}
