import type { Metadata } from "next";
import { requireMaster } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PermissionsGrid } from "@/components/master/permissions-grid";
import { MasterCredentials } from "@/components/master/master-credentials";

export const metadata: Metadata = {
  title: "Master",
  robots: { index: false, follow: false },
};

/**
 * What only the owner does.
 *
 * Deciding what each manager may open, and its own keys. The figures used to
 * live here too, but they were the manager's summary a second time — and a
 * master holds every section, so the real screens are all one click away.
 */
export default async function MasterPage() {
  const me = await requireMaster();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.master;

  const staff = await prisma.user.findMany({
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
  });

  const rows = staff.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    isSelf: u.id === me.id,
  }));
  const managers = rows.filter((s) => s.role === "MANAGER");

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.subtitle} />

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
          {rows
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
