import Link from "next/link";
import { ArrowLeft, ArrowRight, LogIn, PlayCircle } from "lucide-react";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-30" />
      <div
        className="absolute -top-40 start-1/2 size-[40rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand), transparent 70%)", opacity: 0.15 }}
      />

      <header className="relative z-10 flex items-center justify-between p-6">
        <Brand />
        <LanguageSwitcher current={locale} />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
            {dict.common.tagline}
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            {dict.landing.heroTitle}
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            {dict.landing.heroSubtitle}
          </p>
          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
            <Button asChild size="lg" variant="brand" className="w-full sm:w-auto">
              <Link href="/login">
                <LogIn className="size-4" />
                {dict.landing.staffLogin}
                <Arrow className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/member">
                <PlayCircle className="size-4" />
                {dict.landing.memberAccess}
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 p-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} FitFlow
      </footer>
    </div>
  );
}
