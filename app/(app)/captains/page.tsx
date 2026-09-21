import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { AccountsManager } from "@/components/manager/accounts-manager";

export const metadata: Metadata = { title: "Staff accounts" };

export default async function CaptainsPage() {
  const me = await requireRole("MANAGER");
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  // Every account, managers included — the manager owns the whole roster.
  const raw = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      username: true,
      role: true,
      isActive: true,
      canAddVideos: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
  });

  const accounts = raw.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    username: u.username,
    role: u.role,
    isActive: u.isActive,
    canAddVideos: u.canAddVideos,
    createdAt: u.createdAt.toISOString(),
    isSelf: u.id === me.id,
  }));

  return (
    <div>
      <PageHeader
        title={dict.manager.accountsTitle}
        description={dict.manager.accountsSubtitle}
      />
      <AccountsManager accounts={accounts} dict={dict} locale={locale} />
    </div>
  );
}
