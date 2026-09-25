import type { Metadata } from "next";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { AccountsManager } from "@/components/manager/accounts-manager";

export const metadata: Metadata = { title: "Staff accounts" };

export default async function CaptainsPage() {
  const me = await requireSection("STAFF");
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  // Every account a manager is allowed to know about. The master is not one
  // of them: it signs in elsewhere and answers to nobody here.
  const raw = await prisma.user.findMany({
    where: me.role === "MASTER" ? {} : { role: { not: "MASTER" } },
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
