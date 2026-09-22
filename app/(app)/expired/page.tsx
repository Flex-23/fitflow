import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { toNumber } from "@/lib/money";
import { pageFrom, pageSlice, pageInfo } from "@/lib/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiredSubscriptions } from "@/components/reception/expired-subscriptions";

export const metadata: Metadata = { title: "Expired subscriptions" };

export default async function ExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole("RECEPTION");
  await syncSubscriptions();

  const { q, page } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const where = {
    status: "EXPIRED" as const,
    ...(q
      ? { member: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q, mode: "insensitive" as const } }] } }
      : {}),
  };
  const current = pageFrom(page);

  const [total, subs, plansRaw] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      include: { member: true },
      orderBy: { endDate: "desc" },
      ...pageSlice(current),
    }),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { durationDays: "asc" },
    }),
  ]);
  const paging = pageInfo(current, total);

  const rows = subs.map((s) => ({
    subscriptionId: s.id,
    memberId: s.memberId,
    memberName: s.member.name,
    phone: s.member.phone,
    planName: s.planName,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
  }));
  const plans = plansRaw.map((p) => ({
    id: p.id,
    name: p.name,
    price: toNumber(p.price),
    durationDays: p.durationDays,
  }));

  return (
    <div>
      <PageHeader
        title={dict.reception.expiredTitle}
        description={dict.reception.expiredSubtitle}
      />
      <ExpiredSubscriptions rows={rows} plans={plans} paging={paging} dict={dict} locale={locale} />
    </div>
  );
}
