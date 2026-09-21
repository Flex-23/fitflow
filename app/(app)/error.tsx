"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold">حدث خطأ ما · Something went wrong</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          حاول مرة أخرى. إذا استمرت المشكلة تأكد من تشغيل قاعدة البيانات.
        </p>
      </div>
      <Button onClick={reset} variant="brand">
        <RotateCcw className="size-4" />
        إعادة المحاولة · Retry
      </Button>
    </div>
  );
}
