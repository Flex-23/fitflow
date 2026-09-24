import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { Brand } from "@/components/brand";
import { BrandWatermark } from "@/components/brand-watermark";

export const metadata: Metadata = { title: "Offline" };

/**
 * What the installed app shows when the network is gone.
 *
 * The service worker keeps a copy of this page, so it is the one page that
 * still opens with no connection. It touches no database — everything else
 * in FitFlow needs the server, so there is nothing honest to show here
 * beyond saying so.
 */
export default async function OfflinePage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.pwa;

  return (
    <div className="relative grid min-h-dvh place-items-center p-6">
      <BrandWatermark intensity={10} />
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center">
        <Brand size="lg" />
        <div className="grid size-14 place-items-center rounded-full bg-muted/50 text-muted-foreground">
          <WifiOff className="size-7" />
        </div>
        <p className="text-lg font-semibold">{t.offlineTitle}</p>
        <p className="text-sm text-muted-foreground">{t.offlineBody}</p>
      </div>
    </div>
  );
}
