import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { safeGymDay, gymDayRange, currentGymDay } from "@/lib/gym-day";
import { getSetting } from "@/lib/settings";
import { isGateEnabled } from "@/lib/gate/enabled";
import {
  gateHealth,
  GATE_HEARTBEAT_KEY,
  GATE_PANEL_OK_KEY,
} from "@/lib/gate/worker-state";
import { PageHeader } from "@/components/layout/page-header";
import { GateLog } from "@/components/reception/gate-log";
import { GateHealthNote } from "@/components/reception/gate-health-note";

export const metadata: Metadata = { title: "Gate" };

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  // Reception sits next to the turnstile and needs to see why someone was
  // refused; a manager holding the reception section passes too.
  await requireSection("RECEPTION");
  // Hiding the link is not enough; a gym with no turnstile has no such page.
  if (!(await isGateEnabled())) notFound();
  const { day } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  // Same gym-day window as the activity log (03:00 → 02:59).
  const selectedDay = safeGymDay(day);
  const { from, to } = gymDayRange(selectedDay);

  const [logs, heartbeat, panelOkAt] = await Promise.all([
    prisma.gateLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { member: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    getSetting(GATE_HEARTBEAT_KEY, ""),
    getSetting(GATE_PANEL_OK_KEY, ""),
  ]);

  const health = gateHealth(heartbeat, panelOkAt);

  const rows = logs.map((l) => ({
    id: l.id,
    memberId: l.memberId,
    memberName: l.member?.name ?? null,
    memberPhone: l.member?.phone ?? null,
    card: l.card,
    door: l.door,
    allowed: l.allowed,
    reason: l.reason,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader title={dict.gate.title} description={dict.gate.subtitle} />
      <GateHealthNote health={health} dict={dict} locale={locale} />
      <GateLog
        rows={rows}
        day={selectedDay}
        isToday={selectedDay === currentGymDay()}
        dict={dict}
        locale={locale}
      />
    </div>
  );
}
