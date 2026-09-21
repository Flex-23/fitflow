import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Central brand mark. Swap the icon/wordmark here (and the --brand token in
 * globals.css) when the final logo & colours arrive.
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
  const icon = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-xl bg-brand text-brand-foreground shadow-[0_4px_16px_-4px] shadow-brand/50",
          box
        )}
      >
        <Dumbbell className={icon} />
      </span>
      {showText && (
        <span className={cn("tracking-tight", text)}>
          Fit<span className="text-brand">Flow</span>
        </span>
      )}
    </span>
  );
}
