import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandWatermark } from "@/components/brand-watermark";
import { LoginForm } from "@/components/auth/login-form";

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

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Full strength here: the sign-in page has almost nothing on it, so the
          mark can carry the screen. */}
      <BrandWatermark />

      <header className="relative z-10 flex items-center justify-end gap-2 p-6">
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
