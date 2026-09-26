import type { Metadata } from "next";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { hasSection, sectionsFor } from "@/lib/auth/rbac";
import { ensureDailyBackup } from "@/lib/backup";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { getNotificationCount } from "@/lib/notifications-live";
import { isGateEnabled } from "@/lib/gate/enabled";
import { AppShell } from "@/components/layout/app-shell";
import { STAFF_MANIFEST } from "@/lib/pwa";

/**
 * Every staff page points at the staff manifest, so installing from anywhere
 * inside the app gives the green icon and the summary screen — never the
 * member's app, which shares the same origin.
 */
export const metadata: Metadata = {
  manifest: STAFF_MANIFEST,
  icons: { apple: "/icons/staff-apple-touch-icon.png" },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  // Both of these belong to the management section, not to a job title.
  const manages = hasSection(user, "MANAGEMENT");
  const notificationCount = manages ? await getNotificationCount() : 0;
  const gateEnabled = await isGateEnabled();

  // First visit of the day writes a snapshot; runs after the response so it
  // never slows a page down.
  if (manages) after(() => ensureDailyBackup());

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        role: user.role,
        canAddVideos: user.canAddVideos,
        sections: sectionsFor(user),
        gateEnabled,
      }}
      dict={dict}
      locale={locale}
      notificationCount={notificationCount}
    >
      {children}
    </AppShell>
  );
}
