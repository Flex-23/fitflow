import type { Metadata } from "next";
import Link from "next/link";
import { PlayCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";

export const metadata: Metadata = { title: "Member access" };

export default async function MemberPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-20" />
      <header className="relative z-10 flex items-center justify-between p-6">
        <Brand />
        <LanguageSwitcher current={locale} />
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="flex max-w-md flex-col items-center gap-5">
          <div className="grid size-16 place-items-center rounded-2xl bg-brand/15 text-brand">
            <PlayCircle className="size-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {dict.watch.memberInfoTitle}
          </h1>
          <p className="text-muted-foreground">{dict.watch.memberInfoDesc}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand underline"
          >
            {dict.watch.backHome}
            <Arrow className="size-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
