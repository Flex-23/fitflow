import { cookies } from "next/headers";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { ensureDailyBackup } from "@/lib/backup";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { getNotificationCount } from "@/lib/notifications-live";
import { THEME_COOKIE, defaultTheme, isTheme } from "@/lib/theme";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const notificationCount =
    user.role === "MANAGER" ? await getNotificationCount() : 0;
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : defaultTheme;

  // First visit of the day writes a snapshot; runs after the response so it
  // never slows a page down.
  if (user.role === "MANAGER") after(() => ensureDailyBackup());

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        role: user.role,
        canAddVideos: user.canAddVideos,
      }}
      dict={dict}
      locale={locale}
      theme={theme}
      notificationCount={notificationCount}
    >
      {children}
    </AppShell>
  );
}
