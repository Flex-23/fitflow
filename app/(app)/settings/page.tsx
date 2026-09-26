import type { Metadata } from "next";
import { MessageCircle, AlertTriangle } from "lucide-react";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { getExpiringSoonThreshold, getSetting } from "@/lib/settings";
import { isWhatsAppEnabled, countryCode } from "@/lib/whatsapp";
import { WA_NUMBER_KEY, WA_LINKED_AT_KEY } from "@/lib/whatsapp/worker-state";
import { formatDate } from "@/lib/i18n/format";
import { appUrl as resolveAppUrl, isLocalUrl } from "@/lib/app-url";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "@/components/manager/settings-form";
import { WhatsAppLink } from "@/components/manager/whatsapp-link";
import { Separator } from "@/components/ui/separator";
import { getWhatsAppStatus } from "@/app/actions/whatsapp";
import { isGateEnabled } from "@/lib/gate/enabled";
import { isVideoRatingEnabled } from "@/lib/video-rating";
import { GateToggle } from "@/components/master/gate-toggle";
import { VideoRatingToggle } from "@/components/master/video-rating-toggle";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireSection("MANAGEMENT");
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.manager;
  const threshold = await getExpiringSoonThreshold();
  const whatsapp = isWhatsAppEnabled();
  const appUrl = resolveAppUrl();
  const publicUrl = !isLocalUrl(appUrl);
  // The paired number is remembered in the database, so it shows even while
  // the socket is still coming back up after a restart.
  const [linkedNumber, linkedAt, gateEnabled, videoRatingEnabled] = await Promise.all([
    getSetting(WA_NUMBER_KEY, ""),
    getSetting(WA_LINKED_AT_KEY, ""),
    isGateEnabled(),
    isVideoRatingEnabled(),
  ]);

  return (
    <div>
      <PageHeader title={t.settingsTitle} description={t.settingsSubtitle} />
      <div className="grid max-w-3xl gap-6">
        {/* Whether this gym has a turnstile at all. The owner decides, because
            the answer removes a whole section from everyone else's screen. */}
        {me.role === "MASTER" && (
          <Card>
            <CardContent className="pt-6">
              <GateToggle enabled={gateEnabled} dict={dict} />
            </CardContent>
          </Card>
        )}

        {me.role === "MASTER" && (
          <Card>
            <CardContent className="pt-6">
              <VideoRatingToggle enabled={videoRatingEnabled} dict={dict} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{dict.nav.notifications}</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm threshold={threshold} dict={dict} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="size-5 text-brand" />
              {t.whatsappTitle}
            </CardTitle>
            <Badge variant={whatsapp ? "success" : "muted"}>
              {whatsapp ? t.whatsappEnabled : t.whatsappDisabled}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.whatsappDesc}</p>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t.whatsappLinkedNumber}</p>
                <p className="font-semibold" dir="ltr">
                  {linkedNumber ? `+${linkedNumber}` : "—"}
                </p>
                {linkedNumber && linkedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t.whatsappLinkedOn} {formatDate(linkedAt, locale)}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t.whatsappCountryCode}</p>
                <p className="font-semibold" dir="ltr">
                  +{countryCode()}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t.publicUrl}</p>
                <p className="truncate font-semibold" dir="ltr">
                  {appUrl || "—"}
                </p>
              </div>
            </div>
            {whatsapp && !publicUrl && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                {t.localUrlWarning}
              </p>
            )}

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-semibold">{t.whatsappLinkTitle}</p>
              <WhatsAppLink dict={dict} locale={locale} initial={await getWhatsAppStatus()} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
