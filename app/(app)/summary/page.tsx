import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarX2,
  HandCoins,
  LineChart,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { formatMoney, formatDate } from "@/lib/i18n/format";
import { getReport, getMovements, getOutstanding, monthRange } from "@/lib/reports";
import { gymDayRange, currentGymDay } from "@/lib/gym-day";
import { iraqParts } from "@/lib/tz";
import { getNotificationCount } from "@/lib/notifications-live";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/manager/stat-tile";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InstallAppButton } from "@/components/pwa/install-button";

export const metadata: Metadata = { title: "Summary" };

/**
 * The manager's home, and what the installed app opens on.
 *
 * One screen answering the questions asked every morning: what came in
 * today, where the month stands, who still owes money, what needs
 * attention, and who joined. Everything on it is a shortcut into the screen
 * that can actually do something about it — nothing is edited here.
 *
 * Today is the gym day (03:00 to 03:00), the same cut the reports use, so
 * the figure here and the figure there never disagree.
 */
export default async function SummaryPage() {
  await requireSection("FINANCE");
  await syncSubscriptions();

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.summary;
  const cur = dict.common.currency;
  const now = new Date();
  const mp = iraqParts(now);

  const today = gymDayRange(currentGymDay(now));
  const month = monthRange(mp.y, mp.mo);

  const [dayReport, monthReport, movements, outstanding, alerts, counts, newest] =
    await Promise.all([
      getReport(today.from, today.to),
      getReport(month.from, month.to),
      getMovements(today.from, today.to),
      getOutstanding(),
      getNotificationCount(),
      Promise.all([
        prisma.member.count(),
        prisma.subscription.count({
          where: { status: { in: ["ACTIVE", "FROZEN"] }, endDate: { gte: now } },
        }),
        prisma.subscription.count({ where: { status: "EXPIRED" } }),
      ]),
      prisma.member.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, name: true, phone: true, createdAt: true },
      }),
    ]);

  const [totalMembers, activeSubs, expiredSubs] = counts;
  const money = (n: number) => formatMoney(n, locale, cur);

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.subtitle} />

      {/* This is the manager's home screen, so the way to make it one lives
          here. Its own app, with its own icon — not the member's. */}
      <InstallAppButton dict={dict} className="sm:max-w-xs" />

      {/* Today */}
      <section className="space-y-3">
        <SectionHead title={t.today} href="/reports" label={dict.nav.reports} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={ArrowDownLeft}
            tone="success"
            label={t.incomeToday}
            value={money(dayReport.totalIncome)}
            hint={t.collections.replace("{n}", String(dayReport.paymentsCount + dayReport.debtPaymentsCount))}
          />
          <StatTile
            icon={ArrowUpRight}
            tone="destructive"
            label={t.expensesToday}
            value={money(dayReport.expenses)}
            hint={t.entries.replace("{n}", String(dayReport.expensesCount))}
          />
          <StatTile
            icon={TrendingUp}
            tone={dayReport.net >= 0 ? "brand" : "destructive"}
            label={t.netToday}
            value={money(dayReport.net)}
          />
          <StatTile
            icon={UserPlus}
            tone="muted"
            label={t.newToday}
            value={String(dayReport.newMembers)}
            hint={t.subscriptionsSold.replace("{n}", String(dayReport.newSubscriptions))}
          />
        </div>
      </section>

      {/* This month, and money still owed */}
      <section className="space-y-3">
        <SectionHead title={t.thisMonth} href="/reports" label={dict.nav.reports} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={LineChart}
            tone="success"
            label={t.incomeMonth}
            value={money(monthReport.totalIncome)}
          />
          <StatTile
            icon={Receipt}
            tone="destructive"
            label={t.expensesMonth}
            value={money(monthReport.expenses)}
          />
          <StatTile
            icon={TrendingUp}
            tone={monthReport.net >= 0 ? "brand" : "destructive"}
            label={t.netMonth}
            value={money(monthReport.net)}
            hint={
              monthReport.margin === null
                ? undefined
                : t.margin.replace("{n}", monthReport.margin.toFixed(0))
            }
          />
          <StatTile
            icon={Wallet}
            tone="warning"
            label={t.owed}
            value={money(outstanding.deferred + outstanding.debts)}
            hint={t.owedSplit
              .replace("{a}", money(outstanding.deferred))
              .replace("{b}", money(outstanding.debts))}
          />
        </div>
      </section>

      {/* Attention */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LinkTile
          href="/notifications"
          icon={Bell}
          tone={alerts > 0 ? "warning" : "muted"}
          label={dict.nav.notifications}
          value={String(alerts)}
        />
        <LinkTile
          href="/members"
          icon={Users}
          tone="brand"
          label={t.membersTotal}
          value={String(totalMembers)}
        />
        <LinkTile
          href="/active"
          icon={Users}
          tone="success"
          label={dict.nav.active}
          value={String(activeSubs)}
        />
        <LinkTile
          href="/expired"
          icon={CalendarX2}
          tone="destructive"
          label={dict.nav.expired}
          value={String(expiredSubs)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today's movements */}
        <Card className="p-4">
          <SectionHead title={t.movements} href="/reports" label={dict.common.view} />
          {movements.length === 0 ? (
            <EmptyState icon={HandCoins} title={t.noMovements} description={t.noMovementsDesc} />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {movements.slice(0, 8).map((m) => (
                <li key={`${m.kind}-${m.id}`} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      m.kind === "expense"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-success/15 text-success"
                    }`}
                  >
                    {m.kind === "expense" ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownLeft className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.label ?? (m.category ? dict.finance.categories[m.category] : "—")}
                    </p>
                    {m.detail && (
                      <p className="truncate text-xs text-muted-foreground">{m.detail}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      m.kind === "expense" ? "text-destructive" : "text-success"
                    }`}
                  >
                    {m.kind === "expense" ? "−" : "+"}
                    {money(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Newest members */}
        <Card className="p-4">
          <SectionHead title={t.newestMembers} href="/members" label={dict.common.view} />
          {newest.length === 0 ? (
            <EmptyState icon={Users} title={t.noMembers} description={t.noMembersDesc} />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {newest.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                      {m.phone}
                    </p>
                  </div>
                  <Badge variant="muted" className="shrink-0">
                    {formatDate(m.createdAt, locale)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SectionHead({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link href={href} className="text-xs font-medium text-brand hover:underline">
        {label}
      </Link>
    </div>
  );
}

/** A figure that is also the way into the screen it came from. */
function LinkTile({
  href,
  ...tile
}: { href: string } & React.ComponentProps<typeof StatTile>) {
  return (
    <Link href={href} className="rounded-xl transition-opacity hover:opacity-80">
      <StatTile {...tile} />
    </Link>
  );
}
