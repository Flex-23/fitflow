import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { RegistrationForm } from "@/components/reception/registration-form";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Registration" };

export default async function RegistrationPage() {
  const user = await requireSection("RECEPTION");
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const plansRaw = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { durationDays: "asc" },
  });
  const plans = plansRaw.map((p) => ({
    id: p.id,
    name: p.name,
    price: toNumber(p.price),
    durationDays: p.durationDays,
  }));

  return (
    <div>
      <PageHeader
        title={dict.reception.registerTitle}
        description={dict.reception.registerSubtitle}
      />
      {plans.length === 0 && (
        <Card className="mb-6 flex items-center gap-3 border-warning/30 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          {user.role === "MANAGER" ? (
            <span>
              {dict.reception.noPlansWarning}{" "}
              <Link href="/plans" className="font-medium text-brand underline">
                {dict.nav.plans}
              </Link>
            </span>
          ) : (
            <span>{dict.reception.askManagerForPlans}</span>
          )}
        </Card>
      )}
      <RegistrationForm plans={plans} dict={dict} locale={locale} />
    </div>
  );
}
