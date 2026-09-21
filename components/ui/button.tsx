import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        brand:
          "bg-brand text-brand-foreground hover:brightness-105 font-semibold shadow-[0_4px_20px_-4px] shadow-brand/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        link: "text-primary underline-offset-4 hover:underline",
        // "Soft" tones — tinted background, no border. Used for row actions in
        // tables so each action reads at a glance without shouting.
        soft: "bg-accent text-foreground hover:bg-accent/70",
        "soft-brand": "bg-brand/12 text-brand hover:bg-brand/20",
        "soft-success": "bg-success/12 text-success hover:bg-success/20",
        "soft-warning": "bg-warning/15 text-warning hover:bg-warning/25",
        "soft-destructive":
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        xs: "h-8 rounded-md px-2.5 text-xs [&_svg]:size-3.5",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8 rounded-md [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Render the single child element with button styles (e.g. a <Link>). */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild && React.isValidElement(props.children)) {
    const child = props.children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: cn(classes, child.props.className),
    });
  }

  return <button className={classes} {...props} />;
}

export { buttonVariants };
