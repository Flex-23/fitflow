"use client";

import { UserRound, Phone, X, Cake, Ruler, Weight, CalendarDays, Mars, Venus } from "lucide-react";
import type { MemberTrainingProfile } from "@/app/actions/courses";
import { StatusBadge } from "@/components/reception/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FEMALE_MEASUREMENTS } from "@/schemas/member";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/** Selected-member header for the course builders: identity, body stats, subscription. */
export function MemberSummary({
  member,
  dict,
  locale,
  onClear,
}: {
  member: MemberTrainingProfile;
  dict: Dictionary;
  locale: Locale;
  onClear: () => void;
}) {
  const t = dict.captain;
  const r = dict.reception;
  const female = member.gender === "FEMALE";
  const sub = member.subscription;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
            <UserRound className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold leading-tight">{member.name}</p>
              <Badge variant={female ? "brand" : "secondary"} className="gap-1">
                {female ? <Venus className="size-3" /> : <Mars className="size-3" />}
                {female ? r.female : r.male}
              </Badge>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-3.5" />
              <span dir="ltr" className="tabular-nums">{member.phone}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sub && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{sub.planName}</span>
              <span className="text-muted-foreground">
                {formatDate(sub.startDate, locale)} → {formatDate(sub.endDate, locale)}
              </span>
              <StatusBadge status={sub.status} dict={dict} />
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" />
            {t.changeMember}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat icon={Cake} label={t.age} value={member.age ?? "—"} />
        <Stat icon={Ruler} label={r.height} value={member.height ?? "—"} />
        <Stat icon={Weight} label={r.weight} value={member.weight ?? "—"} />
        {female &&
          FEMALE_MEASUREMENTS.map((key) => (
            <Stat key={key} icon={Ruler} label={r[key]} value={member[key] ?? "—"} tone="brand" />
          ))}
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: "brand";
}) {
  return (
    <div className={tone === "brand" ? "rounded-lg bg-brand/10 px-3 py-2" : "rounded-lg bg-muted/50 px-3 py-2"}>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
