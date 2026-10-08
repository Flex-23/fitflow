import type { Metadata } from "next";
import { requireSection } from "@/lib/auth/dal";
import { isGateEnabled } from "@/lib/gate/enabled";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { toNumber, sum, remainingBalance } from "@/lib/money";
import { pageFrom, pageSlice, pageInfo } from "@/lib/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { MembersTable, type SubInfo } from "@/components/reception/members-table";
import { phoneSearchTerm } from "@/lib/phone";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireSection("RECEPTION");
  await syncSubscriptions();

  const { q, page } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const now = new Date();

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: phoneSearchTerm(q) ?? q, mode: "insensitive" as const } },
          { cardNumber: { contains: q.replace(/^0+(?=\d)/, ""), mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const current = pageFrom(page);

  const [total, members, plansRaw, gateEnabled] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      include: {
        // Recent history is enough to find the running + queued subscription.
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { payments: true, freezes: { orderBy: { startedAt: "desc" } } },
        },
      },
      orderBy: { createdAt: "desc" },
      ...pageSlice(current),
    }),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { durationDays: "asc" },
    }),
    isGateEnabled(),
  ]);
  const paging = pageInfo(current, total);

  const rows = members.map((m) => {
    const subs = m.subscriptions.map(
      (s): SubInfo => ({
        id: s.id,
        planName: s.planName,
        status: s.status,
        method: s.method,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        price: toNumber(s.price),
        paid: sum(s.payments.map((p) => toNumber(p.amount))),
        remaining: remainingBalance(s.price, s.payments),
        frozenDaysTotal: s.frozenDaysTotal,
        freezes: s.freezes.map((f) => ({
          id: f.id,
          days: f.days,
          reason: f.reason,
          startedAt: f.startedAt.toISOString(),
          endsAt: f.endsAt.toISOString(),
        })),
      })
    );
    const running = m.subscriptions.filter(
      (s) => (s.status === "ACTIVE" || s.status === "FROZEN") && s.endDate > now
    );
    const currentRaw = running.find((s) => s.startDate <= now) ?? m.subscriptions[0] ?? null;
    const upcomingRaw = running.find((s) => s.startDate > now) ?? null;
    const byId = (id: string | undefined) => subs.find((s) => s.id === id) ?? null;

    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      cardNumber: m.cardNumber,
      gender: m.gender,
      age: m.age,
      height: m.height,
      weight: m.weight,
      chest: m.chest,
      waist: m.waist,
      hips: m.hips,
      glutes: m.glutes,
      arm: m.arm,
      createdAt: m.createdAt.toISOString(),
      current: byId(currentRaw?.id),
      upcoming: byId(upcomingRaw?.id),
    };
  });

  const plans = plansRaw.map((p) => ({
    id: p.id,
    name: p.name,
    price: toNumber(p.price),
    durationDays: p.durationDays,
  }));

  return (
    <div>
      <PageHeader
        title={dict.reception.membersTitle}
        description={dict.reception.membersSubtitle}
      />
      <MembersTable
        rows={rows}
        plans={plans}
        paging={paging}
        dict={dict}
        locale={locale}
        gateEnabled={gateEnabled}
      />
    </div>
  );
}
