import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { toNumber } from "@/lib/money";
import { DAY_MS } from "@/lib/action-state";
import { pageFrom, pageSlice, pageInfo } from "@/lib/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { MembersArchive } from "@/components/manager/members-archive";

export const metadata: Metadata = { title: "Members archive" };

/** A member counts as away once their last subscription ended this long ago. */
const ABSENT_AFTER_DAYS = 30;

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole("MANAGER");
  await syncSubscriptions();

  const { q, page } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const today = new Date();
  const now = today.getTime();
  const cutoff = now - ABSENT_AFTER_DAYS * DAY_MS;

  const [members, plansRaw] = await Promise.all([
    prisma.member.findMany({
      where: {
        ...(q
          ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q, mode: "insensitive" as const } }] }
          : {}),
        // Nobody with a subscription still running (or queued) is "away".
        subscriptions: {
          none: {
            status: { in: ["ACTIVE", "FROZEN"] },
            endDate: { gt: today },
          },
        },
      },
      include: { subscriptions: { orderBy: { endDate: "desc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { durationDays: "asc" },
    }),
  ]);

  // The "absent for 30+ days" cut depends on each member's latest end date,
  // which needs a join — so the filter runs here and paging is applied after.
  const all = members
    // Never-subscribed members are measured from when they registered.
    .map((m) => ({ member: m, since: (m.subscriptions[0]?.endDate ?? m.createdAt).getTime() }))
    .filter((r) => r.since < cutoff)
    .sort((a, b) => a.since - b.since);

  const current = pageFrom(page);
  const paging = pageInfo(current, all.length);
  const { skip, take } = pageSlice(paging.page);

  const rows = all.slice(skip, skip + take).map(({ member: m, since }) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    lastPlanName: m.subscriptions[0]?.planName ?? null,
    absentSince: new Date(since).toISOString(),
    absentDays: Math.floor((now - since) / DAY_MS),
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
        title={dict.manager.archiveTitle}
        description={dict.manager.archiveSubtitle}
      />
      <MembersArchive rows={rows} plans={plans} paging={paging} dict={dict} locale={locale} />
    </div>
  );
}
