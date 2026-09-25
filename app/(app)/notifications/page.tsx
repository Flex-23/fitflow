import type { Metadata } from "next";
import { CalendarClock, CalendarDays, Wallet, Snowflake, BellOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { syncSubscriptions } from "@/lib/subscription-sync";
import { getLiveNotifications } from "@/lib/notifications-live";
import { formatDate, formatMoney, daysUntil } from "@/lib/i18n/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireSection("MANAGEMENT");
  await syncSubscriptions();

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.manager;
  const n = await getLiveNotifications();
  const money = (v: number) => formatMoney(v, locale, dict.common.currency);

  const total =
    n.expiringToday.length +
    n.expiringSoon.length +
    n.deferred.length +
    n.frozen.length;

  if (total === 0) {
    return (
      <div>
        <PageHeader title={t.notificationsTitle} description={t.notificationsSubtitle} />
        <EmptyState icon={BellOff} title={t.allClear} description={t.allClearDesc} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t.notificationsTitle} description={t.notificationsSubtitle} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          icon={CalendarDays}
          tone="destructive"
          title={t.expiringToday}
          count={n.expiringToday.length}
          items={n.expiringToday.map((s) => ({
            key: s.id,
            primary: s.member.name,
            secondary: `${s.planName} • ${s.member.phone}`,
          }))}
        />
        <Section
          icon={CalendarClock}
          tone="warning"
          title={`${t.expiringSoon} (${n.threshold} ${dict.common.days})`}
          count={n.expiringSoon.length}
          items={n.expiringSoon.map((s) => ({
            key: s.id,
            primary: s.member.name,
            secondary: `${formatDate(s.endDate, locale)} • ${daysUntil(s.endDate)} ${t.daysLeft}`,
          }))}
        />
        <Section
          icon={Wallet}
          tone="warning"
          title={t.outstanding}
          count={n.deferred.length}
          items={n.deferred.map((d) => ({
            key: d.subscription.id,
            primary: d.subscription.member.name,
            secondary: `${dict.reception.remaining}: ${money(d.remaining)}`,
          }))}
        />
        <Section
          icon={Snowflake}
          tone="default"
          title={t.currentlyFrozen}
          count={n.frozen.length}
          items={n.frozen.map((s) => ({
            key: s.id,
            primary: s.member.name,
            secondary: s.freezeUntil
              ? `${t.frozenUntil} ${formatDate(s.freezeUntil, locale)}`
              : s.planName,
          }))}
        />
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  items,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  items: { key: string; primary: string; secondary: string }[];
  tone: "destructive" | "warning" | "default";
}) {
  const toneClass =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`size-5 ${toneClass}`} />
          {title}
        </CardTitle>
        <Badge variant={count > 0 ? "secondary" : "muted"}>{count}</Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => (
              <li key={it.key} className="flex items-center justify-between py-2.5">
                <span className="font-medium">{it.primary}</span>
                <span className="text-sm text-muted-foreground" dir="auto">
                  {it.secondary}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
