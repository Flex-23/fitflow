import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The brand mark, sitting behind a page as a watermark.
 *
 * The artwork is a JPG with its own near-black backdrop, so it is blended
 * with `screen`: black contributes nothing and only the green mark comes
 * through, which is why no visible rectangle appears over the page. A radial
 * mask fades the edges for the same reason.
 *
 * `fixed` rather than absolute, so it stays put while a long table scrolls
 * over it instead of sliding around. Purely decorative — aria-hidden, not
 * focusable, and never intercepting a click.
 */
export function BrandWatermark({
  /** 0–100. Low enough that text on top stays comfortably readable. */
  intensity = 100,
  className,
}: {
  intensity?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 z-0 select-none", className)}
      style={{ opacity: intensity / 100 }}
    >
      <Image
        src="/fitflow-logo.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-contain mix-blend-screen [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_72%)]"
      />
    </div>
  );
}
