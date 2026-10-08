import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        // Chrome paints a saved login its own pale colour, which on this dark
        // theme turns the field into a white box. Its background cannot be set
        // directly, so it is buried under an inset shadow and the text tinted
        // to match a normal field. These have to be utilities rather than a
        // base rule: `shadow-sm` above sits in the utilities layer and would
        // otherwise win and strip the shadow back off.
        "autofill:shadow-[inset_0_0_0_1000px_var(--background)]",
        "autofill:[-webkit-text-fill-color:var(--foreground)] autofill:caret-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  );
}
