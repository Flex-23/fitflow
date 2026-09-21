"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions/locale";
import { localeLabel, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  current,
  className,
}: {
  current: Locale;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Locale = current === "ar" ? "en" : "ar";

  function toggle() {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={`Switch to ${localeLabel[next]}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-3 h-9 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        className
      )}
    >
      <Languages className="size-4" />
      <span>{localeLabel[next]}</span>
    </button>
  );
}
