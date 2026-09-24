import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, Dumbbell, FileText, Salad, UserRound } from "lucide-react";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import { getMemberSession } from "@/lib/member-session";
import { getMemberPortal } from "@/lib/member-portal";
import { Brand } from "@/components/brand";
import { BrandWatermark } from "@/components/brand-watermark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/reception/status-badge";

export const metadata: Metadata = {
  title: "My membership",
  // Personal, and never useful in a search result.
  robots: { index: false, follow: false },
};

/**
 * The member's own page — the whole member side of the app.
 *
 * Reached from the personal link sent over WhatsApp, which is swapped for a
 * session by `/me/enter` before anything here runs. Read-only by design:
 * nothing on this page can change gym data.
 */
export default async function MemberPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; e?: string }>;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.portal;
  const { k, e } = await searchParams;

  // Links issued before the entry route existed still point here. Hand them
  // over rather than let them fail.
  if (k) redirect(`/me/enter?k=${encodeURIComponent(k)}`);

  const session = await getMemberSession();
  if (!session) {
    if (e === "locked") return <Locked title={t.tooMany} body={t.tooManyBody} />;
    return <Locked title={t.linkExpired} body={t.linkExpiredBody} />;
  }

  const me = await getMemberPortal(session.memberId);
  if (!me) return <Locked title={t.linkExpired} body={t.linkExpiredBody} />;

  // The gym revoked this member's devices after the session was issued.
  if (me.sessionEpoch !== session.epoch) {
    return <Locked title={t.revoked} body={t.revokedBody} />;
  }

  const sub = me.subscription;
  const running = sub && (sub.status === "ACTIVE" || sub.status === "FROZEN") && sub.daysLeft >= 0;

  return (
    <div className="relative min-h-dvh">
      <BrandWatermark intensity={8} />

      <div className="relative z-10 mx-auto w-full max-w-md space-y-5 p-5 pb-16">
        <header className="flex items-center justify-between">
          <Brand size="sm" />
          <Badge variant="muted">{t.title}</Badge>
        </header>

        {/* Identity */}
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-14 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
              <UserRound className="size-7" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold leading-tight">{me.name}</p>
              <p className="text-sm text-muted-foreground" dir="ltr">
                {me.phone}
              </p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Fact label={dict.reception.age} value={me.age} />
            <Fact label={dict.reception.height} value={me.height} />
            <Fact label={dict.reception.weight} value={me.weight} />
          </dl>

          {me.measurements.length > 0 && (
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
              {me.measurements.map((m) => (
                <Fact
                  key={m.key}
                  label={dict.reception[m.key as "chest"]}
                  value={m.value}
                />
              ))}
            </dl>
          )}
        </section>

        {/* Subscription */}
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-brand" />
            {t.subscription}
          </h2>

          {sub ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-bold">{sub.planName}</span>
                <StatusBadge status={sub.status} dict={dict} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Tile label={dict.reception.startsOn} value={formatDate(sub.startDate, locale)} />
                <Tile label={dict.reception.expiresOn} value={formatDate(sub.endDate, locale)} />
              </div>

              <p
                className={`mt-3 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                  !running
                    ? "bg-destructive/15 text-destructive"
                    : sub.daysLeft <= 3
                      ? "bg-warning/15 text-warning"
                      : "bg-success/15 text-success"
                }`}
              >
                {running
                  ? t.daysLeft.replace("{n}", String(Math.max(0, sub.daysLeft)))
                  : t.expiredNote}
              </p>

              {me.upcoming && (
                <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-center text-xs text-brand">
                  {t.upcoming} {me.upcoming.planName} · {formatDate(me.upcoming.startDate, locale)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noSubscription}</p>
          )}
        </section>

        {/* Courses */}
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-brand" />
            {t.courses}
          </h2>

          {me.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noCourses}</p>
          ) : (
            <ul className="space-y-2">
              {me.courses.map((c) => {
                const Icon = c.kind === "training" ? Dumbbell : Salad;
                return (
                  <li key={c.id}>
                    <Button
                      asChild
                      variant="soft"
                      className="h-auto w-full justify-start gap-3 py-3"
                    >
                      <a href={`/p/${c.shareToken}`} target="_blank" rel="noopener noreferrer">
                        <Icon className="size-4 shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 text-start">
                          <span className="block truncate font-medium">
                            {c.title ??
                              (c.kind === "training" ? t.trainingCourse : t.nutritionCourse)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(c.createdAt, locale)}
                          </span>
                        </span>
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-muted-foreground">{t.footerNote}</p>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{value ?? "—"}</dd>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

/** Shown when there is no usable session — deliberately says very little. */
function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative grid min-h-dvh place-items-center p-6">
      <BrandWatermark intensity={10} />
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center">
        <Brand size="lg" />
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
