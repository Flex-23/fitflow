import type { Metadata } from "next";
import {
  Archive,
  Banknote,
  CalendarX2,
  CreditCard,
  DoorOpen,
  Dumbbell,
  MessageCircle,
  Salad,
  Smartphone,
  Snowflake,
  Tags,
  TrendingUp,
  UserPlus,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { requireMaster } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { formatMoney, formatDateTime } from "@/lib/i18n/format";
import { getMasterOverview } from "@/lib/master-overview";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/manager/stat-tile";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PermissionsGrid } from "@/components/master/permissions-grid";
import { MasterCredentials } from "@/components/master/master-credentials";

export const metadata: Metadata = {
  title: "Master",
  robots: { index: false, follow: false },
};

/**
 * Everything, for the owner.
 *
 * The manager's summary answers how today is going. This answers what the
 * state of the gym is — the money to date, the people, the machinery that
 * has to keep running, and who is allowed to see which part of it.
 */
export default async function MasterPage() {
  const me = await requireMaster();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.master;
  const cur = dict.common.currency;
  const o = await getMasterOverview(me.id);

  const money = (n: number) => formatMoney(n, locale, cur);
  const managers = o.staff.filter((s) => s.role === "MANAGER");

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.subtitle} />

      {/* Money, all of it */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.money}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={Banknote}
            tone="success"
            label={t.todayNet}
            value={money(o.money.today.net)}
            hint={`${money(o.money.today.income)} − ${money(o.money.today.expenses)}`}
          />
          <StatTile
            icon={TrendingUp}
            tone={o.money.month.net >= 0 ? "brand" : "destructive"}
            label={t.monthNet}
            value={money(o.money.month.net)}
            hint={`${money(o.money.month.income)} − ${money(o.money.month.expenses)}`}
          />
          <StatTile
            icon={Wallet}
            tone="warning"
            label={t.owed}
            value={money(o.money.owed.deferred + o.money.owed.debts)}
            hint={dict.summary.owedSplit
              .replace("{a}", money(o.money.owed.deferred))
              .replace("{b}", money(o.money.owed.debts))}
          />
          <StatTile
            icon={Archive}
            tone={o.money.lifetime.net >= 0 ? "success" : "destructive"}
            label={t.lifetimeNet}
            value={money(o.money.lifetime.net)}
            hint={`${money(o.money.lifetime.income)} − ${money(o.money.lifetime.expenses)}`}
          />
        </div>
      </section>

      {/* People */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.people}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Users} label={dict.summary.membersTotal} value={String(o.people.members)} />
          <StatTile
            icon={Users}
            tone="success"
            label={dict.nav.active}
            value={String(o.people.activeSubscriptions)}
          />
          <StatTile
            icon={CalendarX2}
            tone="destructive"
            label={dict.nav.expired}
            value={String(o.people.expiredSubscriptions)}
          />
          <StatTile
            icon={UserPlus}
            tone="muted"
            label={t.newThisMonth}
            value={String(o.people.newThisMonth)}
          />
          <StatTile
            icon={Snowflake}
            tone="muted"
            label={dict.status.frozen}
            value={String(o.people.frozenSubscriptions)}
          />
          <StatTile
            icon={CreditCard}
            tone="muted"
            label={t.withCards}
            value={String(o.people.withCards)}
          />
          <StatTile
            icon={Smartphone}
            tone="muted"
            label={t.withApp}
            value={String(o.people.withPortal)}
          />
          <StatTile icon={Tags} tone="muted" label={dict.nav.plans} value={String(o.content.plans)} />
        </div>
      </section>

      {/* What the gym has made */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.content}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            icon={Dumbbell}
            tone="muted"
            label={dict.nav.training}
            value={String(o.content.trainingCourses)}
          />
          <StatTile
            icon={Salad}
            tone="muted"
            label={dict.nav.nutrition}
            value={String(o.content.nutritionCourses)}
          />
          <StatTile
            icon={Video}
            tone="muted"
            label={dict.nav.videos}
            value={String(o.content.videos)}
          />
        </div>
      </section>

      {/* The machinery that has to keep running */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.machinery}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={DoorOpen}
            tone={o.machinery.gate.panelUp ? "success" : o.machinery.gate.bridgeUp ? "warning" : "destructive"}
            label={dict.nav.gate}
            value={
              o.machinery.gate.panelUp
                ? t.running
                : o.machinery.gate.bridgeUp
                  ? dict.gate.panelOffline
                  : dict.gate.bridgeStopped
            }
          />
          <StatTile
            icon={MessageCircle}
            tone={o.machinery.whatsapp.online ? "success" : "warning"}
            label="WhatsApp"
            value={o.machinery.whatsapp.linked ? `+${o.machinery.whatsapp.linked}` : t.notLinked}
            hint={
              o.machinery.whatsapp.pending || o.machinery.whatsapp.failed
                ? t.queueState
                    .replace("{p}", String(o.machinery.whatsapp.pending))
                    .replace("{f}", String(o.machinery.whatsapp.failed))
                : o.machinery.whatsapp.online
                  ? t.running
                  : dict.manager.whatsappWorkerOffline
            }
          />
          <StatTile
            icon={Archive}
            tone={o.machinery.lastBackup ? "muted" : "warning"}
            label={dict.nav.backup}
            value={
              o.machinery.lastBackup
                ? formatDateTime(o.machinery.lastBackup, locale)
                : t.never
            }
          />
          <StatTile
            icon={Users}
            tone={o.machinery.notifications > 0 ? "warning" : "muted"}
            label={dict.nav.notifications}
            value={String(o.machinery.notifications)}
          />
        </div>
      </section>

      {/* Who may open what */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t.permissions}</h2>
          <p className="text-xs text-muted-foreground">{t.permissionsHelp}</p>
        </div>
        <PermissionsGrid managers={managers} dict={dict} locale={locale} />
      </section>

      {/* The rest of the roster, for the record */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.otherStaff}</h2>
        <Card className="divide-y divide-border">
          {o.staff
            .filter((s) => s.role !== "MANAGER")
            .map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {s.displayName}
                    {s.isSelf && <span className="ms-2 text-xs text-brand">{t.you}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                    {s.username}
                  </span>
                </span>
                <Badge variant={s.role === "MASTER" ? "brand" : "muted"}>
                  {dict.roles[s.role.toLowerCase() as "manager"]}
                </Badge>
                <Badge variant={s.isActive ? "success" : "muted"}>
                  {s.isActive ? dict.status.active : dict.manager.inactiveAccount}
                </Badge>
              </div>
            ))}
        </Card>
      </section>

      {/* The master's own keys */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t.ownAccount}</h2>
          <p className="text-xs text-muted-foreground">{t.ownAccountHelp}</p>
        </div>
        <MasterCredentials username={me.username} dict={dict} />
      </section>
    </div>
  );
}
