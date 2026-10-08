import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="scroll-quiet relative w-full overflow-x-auto">
      {/* Tabular figures throughout: dates, phone numbers, amounts and
          counts then line up down a column instead of drifting with the
          width of each digit. Letters are unaffected. */}
      <table
        className={cn("w-full caption-bottom text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  );
}

/**
 * Where a column sits: against the start of the row, centred, or against
 * the end.
 *
 * Declared once per column and given to both the header and its cells, so
 * the two cannot drift apart — which is how a header ends up over one edge
 * of a badge sitting under the other. It also reaches inside: a cell whose
 * content is a row of badges or buttons is laid out with flex, and text
 * alignment alone would leave that row where it started.
 */
export type ColumnAlign = "start" | "center" | "end";

const alignText: Record<ColumnAlign, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

const alignFlex: Record<ColumnAlign, string> = {
  start: "[&>div]:justify-start",
  center: "[&>div]:justify-center",
  end: "[&>div]:justify-end",
};

export function TableHead({
  className,
  justify = "start",
  ...props
}: React.ComponentProps<"th"> & { justify?: ColumnAlign }) {
  return (
    <th
      className={cn(
        "h-11 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        alignText[justify],
        className
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  justify = "start",
  ...props
}: React.ComponentProps<"td"> & { justify?: ColumnAlign }) {
  return (
    <td
      className={cn("px-4 py-3 align-middle", alignText[justify], alignFlex[justify], className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  );
}
