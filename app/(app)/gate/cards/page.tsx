import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { isGateEnabled } from "@/lib/gate/enabled";
import { PageHeader } from "@/components/layout/page-header";
import { GateCards, type CardRow } from "@/components/manager/gate-cards";

export const metadata: Metadata = { title: "Gate cards" };

export default async function GateCardsPage() {
  await requireSection("MANAGEMENT");
  // Hiding the link is not enough; a gym with no turnstile has no such page —
  // same guard as /gate itself.
  if (!(await isGateEnabled())) notFound();

  await syncSubscriptions();

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const now = new Date();

  const members = await prisma.member.findMany({
    where: { cardWiegand: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      cardNumber: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { status: true, startDate: true, endDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // The subscription actually worth showing: the one running now, or —
  // failing that — the most recent, so an expired member still shows why.
  // Same rule as app/(app)/members/page.tsx.
  const rows: CardRow[] = members.map((m) => {
    const running = m.subscriptions.filter(
      (s) => (s.status === "ACTIVE" || s.status === "FROZEN") && s.endDate > now
    );
    const current = running.find((s) => s.startDate <= now) ?? m.subscriptions[0] ?? null;
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      card: m.cardNumber ?? "",
      status: current?.status ?? null,
    };
  });

  return (
    <div>
      <PageHeader title={dict.gate.cardsTitle} description={dict.gate.cardsSubtitle} />
      <GateCards rows={rows} dict={dict} />
    </div>
  );
}
