import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { PlansManager } from "@/components/reception/plans-manager";

export const metadata: Metadata = { title: "Subscription plans" };

export default async function PlansPage() {
  await requireRole("MANAGER");
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const raw = await prisma.subscriptionPlan.findMany({
    orderBy: [{ isActive: "desc" }, { durationDays: "asc" }],
  });
  const plans = raw.map((p) => ({
    id: p.id,
    name: p.name,
    durationDays: p.durationDays,
    price: toNumber(p.price),
    isActive: p.isActive,
  }));

  return (
    <div>
      <PageHeader
        title={dict.reception.plansTitle}
        description={dict.reception.plansSubtitle}
      />
      <PlansManager plans={plans} dict={dict} locale={locale} />
    </div>
  );
}
