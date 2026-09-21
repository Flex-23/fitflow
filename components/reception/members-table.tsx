"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  Users,
  Phone,
  Pencil,
  RotateCw,
  Eye,
  Trash2,
  AlertTriangle,
  UserRound,
  Cake,
  Ruler,
  Weight,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
  CreditCard,
  ArrowLeft,
  ArrowRight,
  Mars,
  Venus,
  Snowflake,
} from "lucide-react";
import type { PaymentMethod, SubscriptionStatus } from "@prisma/client";
import { updateMember, deleteMember } from "@/app/actions/members";
import { FEMALE_MEASUREMENTS } from "@/schemas/member";
import {
  GenderToggle,
  FemaleMeasurementFields,
  type Gender,
} from "@/components/reception/gender-fields";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import type { PageInfo } from "@/lib/pagination";
import { StatusBadge } from "@/components/reception/status-badge";
import { RenewForm } from "@/components/reception/renew-form";
import type { PlanOption } from "@/components/reception/plan-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, daysUntil } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type SubInfo = {
  id: string;
  planName: string;
  status: SubscriptionStatus;
  method: PaymentMethod;
  startDate: string;
  endDate: string;
  price: number;
  paid: number;
  remaining: number;
  frozenDaysTotal: number;
  freezes: { id: string; days: number; reason: string; startedAt: string; endsAt: string }[];
};

export type MemberRow = {
  id: string;
  name: string;
  phone: string;
  gender: Gender;
  age: number | null;
  height: number | null;
  weight: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  glutes: number | null;
  arm: number | null;
  createdAt: string;
  current: SubInfo | null;
  upcoming: SubInfo | null;
};

type Mode = "details" | "edit" | "renew" | "delete";

export function MembersTable({
  rows,
  plans,
  paging,
  dict,
  locale,
}: {
  rows: MemberRow[];
  plans: PlanOption[];
  paging: PageInfo;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.reception;
  // Track the id (not the row) so the dialog re-reads fresh data after the
  // server revalidates — e.g. right after an edit or a renewal.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  function open(m: MemberRow) {
    setSelectedId(m.id);
    setMode("details");
  }
  const close = () => setMode(null);
  const backToDetails = () => setMode("details");

  const title =
    mode === "edit"
      ? t.editMember
      : mode === "renew"
        ? t.renewTitle
        : mode === "delete"
          ? t.deleteMember
          : t.memberDetails;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder={t.searchMembers} />
        <Badge variant="brand" className="h-8 px-3 text-xs">
          <Users className="size-3.5" />
          {paging.total} {t.membersCount}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t.noMembers} description={t.noMembersDesc} />
      ) : (
        <Card>
          {/* Fixed layout + percentage widths spread the columns evenly across
              the card instead of letting one column swallow the slack. */}
          <Table className="min-w-[40rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[5%] text-center">#</TableHead>
                <TableHead className="w-[22%]">{dict.common.name}</TableHead>
                <TableHead className="w-[8%] text-center">{t.age}</TableHead>
                <TableHead className="w-[17%]">{dict.common.phone}</TableHead>
                <TableHead className="w-[22%]">{t.currentSubscription}</TableHead>
                <TableHead className="w-[11%]">{dict.common.status}</TableHead>
                <TableHead className="w-[15%] text-end">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m, i) => (
                <TableRow key={m.id}>
                  <TableCell className="text-center text-xs font-semibold text-muted-foreground">
                    {paging.from + i}
                  </TableCell>
                  <TableCell className="truncate font-medium">{m.name}</TableCell>
                  <TableCell className="text-center tabular-nums">{m.age ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground" dir="ltr">
                      <Phone className="size-3.5" />
                      <span className="tabular-nums">{m.phone}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {m.current ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{m.current.planName}</span>
                          {m.upcoming && (
                            <Badge variant="brand" className="text-[11px]">
                              +{t.upcoming}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {t.expiresOn} {formatDate(m.current.endDate, locale)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t.none}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.current ? (
                      <StatusBadge status={m.current.status} dict={dict} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button variant="soft-brand" size="xs" onClick={() => open(m)}>
                      <Eye />
                      {t.details}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination info={paging} locale={locale} labels={dict.common.pager} />

      <Dialog
        open={mode !== null && selected !== null}
        onClose={close}
        title={title}
        className={mode === "details" || mode === "edit" ? "max-w-2xl" : "max-w-lg"}
      >
        {selected && mode === "details" && (
          <MemberDetails
            member={selected}
            dict={dict}
            locale={locale}
            onEdit={() => setMode("edit")}
            onRenew={() => setMode("renew")}
            onDelete={() => setMode("delete")}
          />
        )}
        {selected && mode === "delete" && (
          <DeleteConfirm
            key={selected.id}
            member={selected}
            dict={dict}
            locale={locale}
            onDone={close}
            onBack={backToDetails}
          />
        )}
        {selected && mode === "edit" && (
          <EditMemberForm
            key={selected.id}
            member={selected}
            dict={dict}
            locale={locale}
            onDone={backToDetails}
            onBack={backToDetails}
          />
        )}
        {selected && mode === "renew" && (
          <RenewForm
            key={selected.id}
            target={{
              memberId: selected.id,
              memberName: selected.name,
              phone: selected.phone,
              currentPlanName: (selected.upcoming ?? selected.current)?.planName ?? null,
              currentEndDate: (selected.upcoming ?? selected.current)?.endDate ?? null,
            }}
            plans={plans}
            dict={dict}
            locale={locale}
            onDone={backToDetails}
            onBack={backToDetails}
          />
        )}
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Details view ───────────────────────── */

function MemberDetails({
  member,
  dict,
  locale,
  onEdit,
  onRenew,
  onDelete,
}: {
  member: MemberRow;
  dict: Dictionary;
  locale: Locale;
  onEdit: () => void;
  onRenew: () => void;
  onDelete: () => void;
}) {
  const t = dict.reception;
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const sub = member.current;
  const left = sub ? daysUntil(sub.endDate) : null;
  const running =
    sub && (sub.status === "ACTIVE" || sub.status === "FROZEN") && left != null && left >= 0;

  return (
    <div className="space-y-5">
      {/* Identity — full row so long names never get clipped */}
      <div className="flex items-center gap-3">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <UserRound className="size-7" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold leading-tight">{member.name}</p>
            <Badge variant={member.gender === "FEMALE" ? "brand" : "secondary"} className="gap-1">
              {member.gender === "FEMALE" ? <Venus className="size-3" /> : <Mars className="size-3" />}
              {member.gender === "FEMALE" ? t.female : t.male}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-3.5" />
            <span dir="ltr" className="tabular-nums">{member.phone}</span>
          </p>
        </div>
      </div>

      {/* Personal stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={Cake} label={t.age} value={member.age ?? "—"} />
        <Stat icon={Ruler} label={t.height} value={member.height ?? "—"} />
        <Stat icon={Weight} label={t.weight} value={member.weight ?? "—"} />
        <Stat icon={CalendarPlus} label={t.joined} value={formatDate(member.createdAt, locale)} />
      </div>

      {member.gender === "FEMALE" && (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand">
            <Venus className="size-3.5" />
            {t.extraMeasurements}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FEMALE_MEASUREMENTS.map((key) => (
              <Stat key={key} icon={Ruler} label={t[key]} value={member[key] ?? "—"} />
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Subscription */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="size-4 text-brand" />
            {t.subscriptionDetails}
          </p>
          {sub && <StatusBadge status={sub.status} dict={dict} />}
        </div>

        {sub ? (
          <div className="space-y-4 rounded-xl border border-border p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{sub.planName}</span>
              <Badge variant={sub.method === "CASH" ? "success" : "warning"}>
                {sub.method === "CASH" ? dict.method.cash : dict.method.deferred}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTile icon={CalendarDays} label={t.period}>
                {formatDate(sub.startDate, locale)} → {formatDate(sub.endDate, locale)}
              </InfoTile>
              <InfoTile icon={CalendarClock} label={t.daysLeft}>
                {left != null && (
                  <span
                    className={cn(
                      "font-semibold",
                      left < 0 ? "text-destructive" : left <= 3 ? "text-warning" : "text-success"
                    )}
                  >
                    {left < 0
                      ? t.daysAgo.replace("{n}", String(Math.abs(left)))
                      : `${left} ${dict.common.days}`}
                  </span>
                )}
              </InfoTile>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
              <Money label={t.totalDue} value={money(sub.price)} />
              <Money label={t.received} value={money(sub.paid)} tone="success" />
              <Money
                label={t.remaining}
                value={money(sub.remaining)}
                tone={sub.remaining > 0 ? "warning" : "success"}
              />
            </div>

            {/* Freeze history — every pause and why, plus the days credited. */}
            {sub.freezes.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Snowflake className="size-3.5" />
                    {t.freezeHistory}
                  </span>
                  <span>
                    {t.frozenDaysTotal}: {sub.frozenDaysTotal} {dict.common.days}
                  </span>
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border text-xs">
                  {sub.freezes.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{f.reason}</p>
                        <p className="text-muted-foreground">
                          {formatDate(f.startedAt, locale)} → {formatDate(f.endsAt, locale)}
                        </p>
                      </div>
                      <Badge variant="warning" className="shrink-0">
                        {f.days} {dict.common.days}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t.none}
          </p>
        )}

        {member.upcoming && (
          <div className="flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-brand">
              <CalendarPlus className="size-3.5" />
              {t.upcomingSubscription}: {member.upcoming.planName}
            </span>
            <span className="text-muted-foreground">
              {t.startsOn} {formatDate(member.upcoming.startDate, locale)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="soft-destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          {t.deleteMember}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil className="size-4" />
            {t.editMember}
          </Button>
          <Button type="button" variant="brand" onClick={onRenew}>
            <RotateCw className="size-4" />
            {running ? t.renewTitle : t.renew}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Delete confirm ───────────────────────── */

function DeleteConfirm({
  member,
  dict,
  locale,
  onDone,
  onBack,
}: {
  member: MemberRow;
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = dict.reception;
  const [pending, start] = useTransition();
  const BackArrow = locale === "ar" ? ArrowRight : ArrowLeft;
  const owed = member.current?.remaining ?? 0;

  function confirm() {
    start(async () => {
      const res = await deleteMember(member.id);
      if (res.ok) {
        toast.success(t.memberDeleted);
        onDone();
      } else {
        toast.error(dict.common.somethingWrong);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-semibold">{member.name}</p>
          <p className="text-muted-foreground" dir="ltr">
            {member.phone}
          </p>
          <p className="pt-1">{t.deleteMemberDesc}</p>
        </div>
      </div>

      {owed > 0 && (
        <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs font-medium text-warning">
          {t.deleteBalanceWarning.replace(
            "{amount}",
            formatMoney(owed, locale, dict.common.currency)
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          <BackArrow className="size-4" />
          {t.backToDetails}
        </Button>
        <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
          <Trash2 className="size-4" />
          {pending ? dict.common.saving : dict.common.delete}
        </Button>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  );
}

function Money({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-base font-bold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ───────────────────────── Edit form ───────────────────────── */

function EditMemberForm({
  member,
  dict,
  locale,
  onDone,
  onBack,
}: {
  member: MemberRow;
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = dict.reception;
  const [state, action, pending] = useActionState(updateMember, emptyState);
  const [gender, setGender] = useState<Gender>(member.gender);
  const BackArrow = locale === "ar" ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (state.ok) {
      toast.success(t.memberUpdated);
      onDone();
    } else if (state.error === "phone_exists") {
      toast.error(t.phoneExists);
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t, dict.common.somethingWrong]);

  const err = (field: string) => (state.fieldErrors?.[field] ? t.invalidField : null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={member.id} />
      <div className="space-y-2">
        <Label htmlFor="name">{t.fullName}</Label>
        <Input id="name" name="name" defaultValue={member.name} required autoFocus />
        {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">{dict.common.phone}</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={member.phone}
            required
            inputMode="tel"
            dir="ltr"
            className="text-start"
          />
          {err("phone") && <p className="text-xs text-destructive">{err("phone")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">{t.gender}</Label>
          <GenderToggle value={gender} onChange={setGender} dict={dict} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="age">{t.age}</Label>
          <Input id="age" name="age" type="number" min={1} max={120} required defaultValue={member.age ?? ""} />
          {err("age") && <p className="text-xs text-destructive">{err("age")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="height">{t.height}</Label>
          <Input id="height" name="height" type="number" step="0.1" min={1} required defaultValue={member.height ?? ""} />
          {err("height") && <p className="text-xs text-destructive">{err("height")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight">{t.weight}</Label>
          <Input id="weight" name="weight" type="number" step="0.1" min={1} required defaultValue={member.weight ?? ""} />
          {err("weight") && <p className="text-xs text-destructive">{err("weight")}</p>}
        </div>
      </div>

      {gender === "FEMALE" && (
        <FemaleMeasurementFields
          dict={dict}
          defaults={{
            chest: member.chest,
            waist: member.waist,
            hips: member.hips,
            glutes: member.glutes,
            arm: member.arm,
          }}
          errors={state.fieldErrors}
        />
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onBack}>
          <BackArrow className="size-4" />
          {t.backToDetails}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? dict.common.saving : dict.common.save}
        </Button>
      </div>
    </form>
  );
}
