import type { Metadata } from "next";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { getExpiringSoonThreshold } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { ActiveSubscriptions } from "@/components/reception/active-subscriptions";

export const metadata: Metadata = { title: "Active subscriptions" };

export default async function ActivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSection("RECEPTION");
  await syncSubscriptions();

  const { q } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const threshold = await getExpiringSoonThreshold();

  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "FROZEN"] },
      ...(q
        ? { member: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q, mode: "insensitive" as const } }] } }
        : {}),
    },
    include: { member: true },
    orderBy: { endDate: "asc" },
  });

  const rows = subs.map((s) => ({
    id: s.id,
    memberName: s.member.name,
    phone: s.member.phone,
    planName: s.planName,
    method: s.method,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    status: s.status as "ACTIVE" | "FROZEN",
    freezeUntil: s.freezeUntil?.toISOString() ?? null,
  }));

  return (
    <div>
      <PageHeader
        title={dict.reception.activeTitle}
        description={dict.reception.activeSubtitle}
      />
      <ActiveSubscriptions rows={rows} dict={dict} locale={locale} threshold={threshold} />
    </div>
  );
}
