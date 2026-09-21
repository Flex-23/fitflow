import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/components/auth/login-form";
import { cookies } from "next/headers";
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
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand / marketing panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-secondary to-background lg:flex lg:flex-col lg:justify-between p-12">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div
          className="absolute -top-24 -end-24 size-96 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)", opacity: 0.25 }}
        />
        <div className="relative">
          <Brand size="lg" />
        </div>
        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            {dict.landing.heroTitle}
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            {dict.landing.heroSubtitle}
          </p>
        </div>
        <div className="relative text-sm text-muted-foreground">
          © {new Date().getFullYear()} FitFlow
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="absolute end-6 top-6 flex items-center gap-2">
          <ThemeToggle
            current={theme}
            labels={{ light: dict.common.lightMode, dark: dict.common.darkMode }}
          />
          <LanguageSwitcher current={locale} />
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:hidden">
            <Brand size="lg" className="justify-center" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {dict.auth.welcomeBack}
            </h2>
            <p className="text-sm text-muted-foreground">
              {dict.auth.signInSubtitle}
            </p>
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
      </div>
    </div>
  );
}
