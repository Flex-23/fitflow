"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !text-card-foreground !border-border !rounded-xl !shadow-lg",
        },
      }}
      {...props}
    />
  );
}
