import Link from "next/link";
import { Compass } from "lucide-react";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center">
      <div className="bg-grid absolute inset-0 opacity-20" />
      <div className="relative flex flex-col items-center gap-5">
        <Brand size="lg" />
        <div className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Compass className="size-8" />
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-bold">404</p>
          <p className="text-muted-foreground">الصفحة غير موجودة · Page not found</p>
        </div>
        <Link href="/" className="text-sm font-medium text-brand underline">
          العودة للرئيسية · Back to home
        </Link>
      </div>
    </div>
  );
}
