import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { purgeExpiredCourses } from "@/lib/courses";
import { canSendCourses } from "@/lib/whatsapp";
import { PageHeader } from "@/components/layout/page-header";
import { NutritionBuilder } from "@/components/captain/nutrition-builder";

export const metadata: Metadata = { title: "Nutrition course" };

export default async function NutritionPage() {
  await requireRole("CAPTAIN");
  await purgeExpiredCourses();

  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <div>
      <PageHeader
        title={dict.captain.nutritionTitle}
        description={dict.captain.nutritionSubtitle}
      />
      <NutritionBuilder dict={dict} locale={locale} whatsappEnabled={canSendCourses()} />
    </div>
  );
}
