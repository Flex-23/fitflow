import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { monthRange } from "@/lib/reports";
import { safeMonth } from "@/lib/gym-day";
import { PageHeader } from "@/components/layout/page-header";
import { ExpensesManager } from "@/components/manager/expenses-manager";
import type { ExpenseCategoryKey } from "@/schemas/finance";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string }>;
}) {
  await requireRole("MANAGER");
  const { q, month } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  // The ledger is scoped to one month and starts fresh on the 1st; older
  // months stay available through the picker.
  const selectedMonth = safeMonth(month);
  const [y, m] = selectedMonth.split("-").map(Number);
  const { from, to } = monthRange(y, m);

  const raw = await prisma.expense.findMany({
    where: {
      spentAt: { gte: from, lte: to },
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: { createdBy: { select: { displayName: true } } },
    orderBy: { spentAt: "desc" },
  });

  const rows = raw.map((e) => ({
    id: e.id,
    title: e.title,
    amount: toNumber(e.amount),
    category: e.category as ExpenseCategoryKey,
    note: e.note,
    spentAt: e.spentAt.toISOString(),
    createdByName: e.createdBy?.displayName ?? null,
  }));

  return (
    <div>
      <PageHeader
        title={dict.finance.expensesTitle}
        description={dict.finance.expensesSubtitle}
      />
      <ExpensesManager
        rows={rows}
        month={selectedMonth}
        monthStart={from.toISOString()}
        dict={dict}
        locale={locale}
      />
    </div>
  );
}
