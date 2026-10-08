import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandWatermark } from "@/components/brand-watermark";
import type { Locale } from "@/lib/i18n/config";

/** The sign-in frame shared by the door chooser and each door. */
export function LoginShell({
  locale,
  title,
  subtitle,
  children,
}: {
  locale: Locale;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
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
          {/* Deliberately see-through: the mark behind is the point. */}
          <div className="rounded-2xl border border-white/15 bg-card/35 p-7 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-7 space-y-1.5 text-center">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} FitFlow
          </p>
        </div>
      </main>
    </div>
  );
}
