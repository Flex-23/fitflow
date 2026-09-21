"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { setTheme } from "@/app/actions/theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  current,
  labels,
  className,
}: {
  current: Theme;
  labels: { light: string; dark: string };
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next: Theme = current === "dark" ? "light" : "dark";
  const Icon = current === "dark" ? Sun : Moon;

  function toggle() {
    // Flip the class immediately so the switch feels instant; the cookie
    // makes it stick across reloads.
    document.documentElement.classList.toggle("dark", next === "dark");
    start(async () => {
      await setTheme(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={labels[next]}
      aria-label={labels[next]}
      className={cn(
        "grid size-9 place-items-center rounded-lg border border-border bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        className
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
