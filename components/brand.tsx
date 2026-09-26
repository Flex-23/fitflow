import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Central brand mark — the gym's own logo (`/icons/icon-512.png`), shown
 * wherever the app identifies itself: sign-in, the member pages, the staff
 * sidebar, and the error/offline screens. One image, one place to change it.
 */
export function Brand({
  className,
  showText = true,
  size = "md",
}: {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "size-10" : size === "sm" ? "size-7" : "size-8";
  const px = size === "lg" ? 40 : size === "sm" ? 28 : 32;
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", className)}>
      <span
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-xl shadow-[0_4px_16px_-4px] shadow-brand/50",
          box
        )}
      >
        <Image
          src="/icons/icon-512.png"
          alt="FitFlow"
          width={px}
          height={px}
          priority
          className="size-full object-cover"
        />
      </span>
      {showText && (
        <span className={cn("tracking-tight", text)}>
          Fit<span className="text-brand">Flow</span>
        </span>
      )}
    </span>
  );
}
