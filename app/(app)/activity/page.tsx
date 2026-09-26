import type { Metadata } from "next";
import type { ActivityAction } from "@prisma/client";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { safeGymDay, gymDayRange, currentGymDay } from "@/lib/gym-day";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityLog } from "@/components/manager/activity-log";

export const metadata: Metadata = { title: "Activity log" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; action?: string; day?: string }>;
}) {
  await requireSection("MANAGEMENT");
  const { userId, action, day } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  // The log is read one gym day at a time (03:00 → 02:59), so it starts
  // clean every morning; earlier days stay reachable through the picker.
  const selectedDay = safeGymDay(day);
  const { from, to } = gymDayRange(selectedDay);

  const actionLabels = dict.activityActions;
  const validAction =
    action && action in actionLabels ? (action as ActivityAction) : undefined;

  const [users, logs] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, displayName: true, role: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(userId ? { userId } : {}),
        ...(validAction ? { action: validAction } : {}),
      },
      include: { user: { select: { displayName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const rows = logs.map((l) => ({
    id: l.id,
    userName: l.user.displayName,
    userRole: l.user.role,
    action: l.action,
    details: l.details,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title={dict.manager.activityTitle}
        description={dict.manager.activitySubtitle}
      />
      <ActivityLog
        rows={rows}
        users={users.map((u) => ({ id: u.id, name: u.displayName }))}
        day={selectedDay}
        isToday={selectedDay === currentGymDay()}
        selectedUserId={userId ?? ""}
        selectedAction={validAction ?? ""}
        dict={dict}
        locale={locale}
      />
    </div>
  );
}
