import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/components/auth/login-form";
import { THEME_COOKIE, defaultTheme, isTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Sign in" };

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
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : defaultTheme;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* ── Watermark ──
          The brand mark fills the screen behind everything, faded far enough
          that the form on top stays the thing you read. aria-hidden and
          pointer-events-none so it is scenery, never content.

          The artwork is a dark-background JPG, which needs handling per theme:
          on dark, `screen` blending drops its near-black backdrop away and
          leaves only the green mark glowing; on light that trick would erase
          it, so it simply sits at a very low opacity. The radial mask fades
          all four edges, otherwise the letterboxed image reads as a rectangle
          pasted on the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        <Image
          src="/fitflow-logo.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-contain opacity-[0.07] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_72%)] dark:opacity-100 dark:mix-blend-screen"
        />
      </div>

      <header className="relative z-10 flex items-center justify-end gap-2 p-6">
        <ThemeToggle
          current={theme}
          labels={{ light: dict.common.lightMode, dark: dict.common.darkMode }}
        />
        <LanguageSwitcher current={locale} />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          {/* Deliberately see-through: the mark behind is the point. Only a
              light blur, so what shows through still reads as the logo rather
              than a smear, and just enough tint to keep the labels legible
              where the bright green passes under them. */}
          <div className="rounded-2xl border border-white/15 bg-card/35 p-7 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-7 space-y-1.5 text-center">
              <h1 className="text-2xl font-bold tracking-tight">{dict.auth.welcomeBack}</h1>
              <p className="text-sm text-muted-foreground">{dict.auth.signInSubtitle}</p>
            </div>

            <LoginForm
              next={safeNext}
              labels={{
                username: dict.auth.username,
                password: dict.auth.password,
                usernamePlaceholder: dict.auth.usernamePlaceholder,
                passwordPlaceholder: dict.auth.passwordPlaceholder,
                signIn: dict.auth.signIn,
                signingIn: dict.auth.signingIn,
                invalidCredentials: dict.auth.invalidCredentials,
                accountDisabled: dict.auth.accountDisabled,
                tooManyAttempts: dict.auth.tooManyAttempts,
                attemptsLeft: dict.auth.attemptsLeft,
              }}
            />
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} FitFlow
          </p>
        </div>
      </main>
    </div>
  );
}
