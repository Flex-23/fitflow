import type { Metadata } from "next";
import Link from "next/link";
import { Headset, Dumbbell, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { LoginShell } from "@/components/auth/login-shell";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The front of sign-in: which kind of staff member is this?
 *
 * Each kind has its own door — reception and captains pick their name from a
 * list, managers type a username — so the choice is made here first. A
 * destination the person was bounced from rides along to the door.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const { next } = await searchParams;
  // Only a same-origin path may be carried through to the redirect.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const suffix = safeNext ? `?next=${encodeURIComponent(safeNext)}` : "";
  const Arrow = locale === "ar" ? ChevronLeft : ChevronRight;

  const doors = [
    { href: `/login/reception${suffix}`, label: dict.auth.doorReception, icon: Headset },
    { href: `/login/captain${suffix}`, label: dict.auth.doorCaptain, icon: Dumbbell },
    { href: `/login/manager${suffix}`, label: dict.auth.doorManager, icon: ShieldCheck },
  ];

  return (
    <LoginShell locale={locale} title={dict.auth.welcomeBack} subtitle={dict.auth.chooseDoor}>
      <div className="space-y-3">
        {doors.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3.5 font-medium transition-colors hover:border-brand/50 hover:bg-brand/10"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-brand/15 text-brand">
              <Icon className="size-5" />
            </span>
            <span className="flex-1">{label}</span>
            <Arrow className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </LoginShell>
  );
}
