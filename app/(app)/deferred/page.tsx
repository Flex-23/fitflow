import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { toNumber, sum, remainingBalance } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { DeferredPayments } from "@/components/reception/deferred-payments";

export const metadata: Metadata = { title: "Deferred payments" };

export default async function DeferredPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireRole("RECEPTION");
  await syncSubscriptions();
  // Reception needs each member's own balance to collect payments; only the
  // gym-wide totals are the manager's business.
  const canSeeTotals = user.role === "MANAGER";

  const { q } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const subs = await prisma.subscription.findMany({
    where: {
      method: "DEFERRED",
      status: { in: ["ACTIVE", "EXPIRED", "FROZEN"] },
      ...(q
        ? { member: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q, mode: "insensitive" as const } }] } }
        : {}),
    },
    include: {
      member: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = subs
    .filter((s) => remainingBalance(s.price, s.payments) > 0)
    .map((s) => ({
      id: s.id,
      memberName: s.member.name,
      phone: s.member.phone,
      planName: s.planName,
      status: s.status,
      endDate: s.endDate.toISOString(),
      total: toNumber(s.price),
      received: sum(s.payments.map((p) => toNumber(p.amount))),
      remaining: remainingBalance(s.price, s.payments),
      payments: s.payments.map((p) => ({
        id: p.id,
        amount: toNumber(p.amount),
        note: p.note,
        createdAt: p.createdAt.toISOString(),
      })),
    }));

  return (
    <div>
      <PageHeader
        title={dict.reception.deferredTitle}
        description={dict.reception.deferredSubtitle}
      />
      <DeferredPayments rows={rows} dict={dict} locale={locale} canSeeTotals={canSeeTotals} />
    </div>
  );
}
