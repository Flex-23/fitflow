import "server-only";
import type { Role, Section } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber, sum } from "@/lib/money";
import { getReport, getOutstanding, monthRange } from "@/lib/reports";
import { gymDayRange, currentGymDay } from "@/lib/gym-day";
import { getSetting } from "@/lib/settings";
import { getNotificationCount } from "@/lib/notifications-live";
import { listBackups } from "@/lib/backup";
import {
  WA_HEARTBEAT_KEY,
  WA_NUMBER_KEY,
  WORKER_STALE_MS,
} from "@/lib/whatsapp/worker-state";
import {
  gateHealth,
  GATE_HEARTBEAT_KEY,
  GATE_PANEL_OK_KEY,
  type GateHealth,
} from "@/lib/gate/worker-state";

/**
 * The whole gym on one screen, for the one person entitled to all of it.
 *
 * The manager's summary answers "how is today going". This answers "what is
 * the state of everything" — money, people, staff, the machinery that has to
 * keep running, and who can open what. Nothing here is filtered by section,
 * because the master holds them all.
 */

export type StaffRow = {
  id: string;
  displayName: string;
  username: string;
  role: Role;
  isActive: boolean;
  canAddVideos: boolean;
  sections: Section[];
  createdAt: string;
  isSelf: boolean;
};

export type MasterOverview = {
  money: {
    today: { income: number; expenses: number; net: number };
    month: { income: number; expenses: number; net: number };
    owed: { deferred: number; debts: number };
    /** Every payment ever taken, less every expense ever paid. */
    lifetime: { income: number; expenses: number; net: number };
  };
  people: {
    members: number;
    activeSubscriptions: number;
    expiredSubscriptions: number;
    frozenSubscriptions: number;
    newThisMonth: number;
    withCards: number;
    withPortal: number;
  };
  content: { trainingCourses: number; nutritionCourses: number; videos: number; plans: number };
  machinery: {
    gate: GateHealth;
    whatsapp: { linked: string | null; online: boolean; pending: number; failed: number };
    notifications: number;
    lastBackup: string | null;
  };
  staff: StaffRow[];
};

export async function getMasterOverview(masterId: string): Promise<MasterOverview> {
  const now = new Date();
  const today = gymDayRange(currentGymDay(now));
  const month = monthRange(now.getFullYear(), now.getMonth() + 1);
  const monthStart = month.from;

  const [
    dayReport,
    monthReport,
    owed,
    payments,
    debtPayments,
    expenses,
    members,
    activeSubs,
    expiredSubs,
    frozenSubs,
    newThisMonth,
    withCards,
    withPortal,
    trainingCourses,
    nutritionCourses,
    videos,
    plans,
    gateBeat,
    gatePanel,
    waNumber,
    waBeat,
    waPending,
    waFailed,
    notifications,
    lastBackup,
    staffRaw,
  ] = await Promise.all([
    getReport(today.from, today.to),
    getReport(month.from, month.to),
    getOutstanding(),
    prisma.payment.findMany({ select: { amount: true } }),
    prisma.debtPayment.findMany({ select: { amount: true } }),
    prisma.expense.findMany({ select: { amount: true } }),
    prisma.member.count(),
    prisma.subscription.count({
      where: { status: { in: ["ACTIVE", "FROZEN"] }, endDate: { gte: now } },
    }),
    prisma.subscription.count({ where: { status: "EXPIRED" } }),
    prisma.subscription.count({ where: { status: "FROZEN" } }),
    prisma.member.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.member.count({ where: { cardNumber: { not: null } } }),
    prisma.member.count({ where: { portalActivatedAt: { not: null } } }),
    prisma.trainingCourse.count({ where: { isTemplate: false } }),
    prisma.nutritionCourse.count(),
    prisma.video.count(),
    prisma.subscriptionPlan.count({ where: { isActive: true } }),
    getSetting(GATE_HEARTBEAT_KEY, ""),
    getSetting(GATE_PANEL_OK_KEY, ""),
    getSetting(WA_NUMBER_KEY, ""),
    getSetting(WA_HEARTBEAT_KEY, ""),
    prisma.whatsAppOutbox.count({ where: { status: "PENDING" } }),
    prisma.whatsAppOutbox.count({ where: { status: "FAILED" } }),
    getNotificationCount(),
    // Snapshots live in storage, not in a table; an unreachable bucket is
    // reported as "no backup" rather than failing this whole screen.
    listBackups().catch(() => []),
    prisma.user.findMany({
      select: {
        id: true,
        displayName: true,
        username: true,
        role: true,
        isActive: true,
        canAddVideos: true,
        sections: true,
        createdAt: true,
      },
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
    }),
  ]);

  const lifetimeIncome =
    sum(payments.map((p) => toNumber(p.amount))) +
    sum(debtPayments.map((p) => toNumber(p.amount)));
  const lifetimeExpenses = sum(expenses.map((e) => toNumber(e.amount)));
  const waSeen = waBeat ? Date.parse(waBeat) : NaN;

  return {
    money: {
      today: {
        income: dayReport.totalIncome,
        expenses: dayReport.expenses,
        net: dayReport.net,
      },
      month: {
        income: monthReport.totalIncome,
        expenses: monthReport.expenses,
        net: monthReport.net,
      },
      owed,
      lifetime: {
        income: lifetimeIncome,
        expenses: lifetimeExpenses,
        net: lifetimeIncome - lifetimeExpenses,
      },
    },
    people: {
      members,
      activeSubscriptions: activeSubs,
      expiredSubscriptions: expiredSubs,
      frozenSubscriptions: frozenSubs,
      newThisMonth,
      withCards,
      withPortal,
    },
    content: { trainingCourses, nutritionCourses, videos, plans },
    machinery: {
      gate: gateHealth(gateBeat, gatePanel, now.getTime()),
      whatsapp: {
        linked: waNumber || null,
        online: Number.isFinite(waSeen) && now.getTime() - waSeen < WORKER_STALE_MS,
        pending: waPending,
        failed: waFailed,
      },
      notifications,
      lastBackup: lastBackup[0]?.createdAt ?? null,
    },
    staff: staffRaw.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      isSelf: u.id === masterId,
    })),
  };
}
