import type { Metadata } from "next";
import { ShieldOff } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "No access" };

/**
 * Where a manager lands when the master has granted them nothing.
 *
 * A real state, not an error: it happens the moment a manager is created and
 * before any section is given, and it is where every guard sends someone who
 * holds nothing. Saying so plainly beats bouncing them between pages that
 * all refuse them.
 */
export default async function NoAccessPage() {
  await requireUser();
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <EmptyState
      icon={ShieldOff}
      title={dict.master.noAccessTitle}
      description={dict.master.noAccessBody}
    />
  );
}
