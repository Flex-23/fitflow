import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { isMasterGate } from "@/lib/auth/master-gate";
import { masterLogin } from "@/app/actions/auth";
import { BrandWatermark } from "@/components/brand-watermark";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Nothing about this page should reach a search engine, a history sync or a
 * shoulder. It is titled as plainly as a 404 would be.
 */
export const metadata: Metadata = {
  title: "Access",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The master's sign-in, at an address only the owner knows.
 *
 * A wrong segment is not "forbidden" — it is `notFound()`, the same answer
 * this app gives for any page that does not exist. Someone probing cannot
 * tell the difference between a bad guess and a door that was never here,
 * which is the whole reason the address is the secret.
 */
export default async function MasterAccessPage({
  params,
}: {
  params: Promise<{ gate: string }>;
}) {
  const { gate } = await params;
  if (!isMasterGate(gate)) notFound();

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.auth;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <BrandWatermark />

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-white/15 bg-card/40 p-7 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-7 space-y-1.5 text-center">
              <h1 className="text-2xl font-bold tracking-tight">{t.masterSignIn}</h1>
              <p className="text-sm text-muted-foreground">{t.masterSignInSubtitle}</p>
            </div>

            <LoginForm
              signIn={masterLogin}
              hidden={{ gate }}
              labels={{
                username: t.username,
                password: t.password,
                usernamePlaceholder: t.usernamePlaceholder,
                passwordPlaceholder: t.passwordPlaceholder,
                signIn: t.signIn,
                signingIn: t.signingIn,
                invalidCredentials: t.invalidCredentials,
                accountDisabled: t.accountDisabled,
                tooManyAttempts: t.tooManyAttempts,
                attemptsLeft: t.attemptsLeft,
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
