"use client";

import { useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  User,
  Phone,
  Ruler,
  Weight,
  Cake,
  CreditCard,
  CalendarDays,
  CalendarCheck,
  Receipt,
} from "lucide-react";
import { registerMember } from "@/app/actions/members";
import { emptyState, DAY_MS, type ActionState } from "@/lib/action-state";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PlanPicker,
  type PlanOption,
} from "@/components/reception/plan-picker";
import {
  PaymentMethodToggle,
  type PaymentMethod,
} from "@/components/reception/payment-method-toggle";
import {
  GenderToggle,
  FemaleMeasurementFields,
  type Gender,
} from "@/components/reception/gender-fields";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type { PlanOption };

export function RegistrationForm({
  plans,
  dict,
  locale,
}: {
  plans: PlanOption[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.reception;
  const formRef = useRef<HTMLFormElement>(null);
  // Captured once so the projected end date is stable across re-renders.
  const [today] = useState(() => Date.now());

  const [gender, setGender] = useState<Gender | "">("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [planId, setPlanId] = useState("");
  const [received, setReceived] = useState("");

  // Feedback + form reset happen inside the action itself (not in an effect)
  // so the UI reacts exactly once per submission.
  const [state, action, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await registerMember(prev, formData);
      if (res.ok) {
        toast.success(t.registered);
        formRef.current?.reset();
        setGender("");
        setMethod("CASH");
        setPlanId("");
        setReceived("");
      } else if (res.error === "phone_exists") {
        toast.error(t.phoneExists);
      } else if (res.error === "invalid_plan") {
        toast.error(t.invalidPlan);
      } else if (res.error === "invalid" && res.fieldErrors?.planId) {
        toast.error(t.noPlanSelected);
      } else if (res.error) {
        toast.error(dict.common.somethingWrong);
      }
      return res;
    },
    emptyState,
  );

  const plan = useMemo(
    () => plans.find((p) => p.id === planId),
    [plans, planId],
  );
  const total = plan?.price ?? 0;
  const receivedNum =
    method === "CASH" ? total : Math.min(Number(received || 0), total);
  const remaining = Math.max(0, total - receivedNum);
  const endDate = plan ? new Date(today + plan.durationDays * DAY_MS) : null;

  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const err = (field: string) =>
    state.fieldErrors?.[field] ? t.invalidField : null;

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (!gender) {
          e.preventDefault();
          toast.error(`${t.gender}: ${dict.common.required}`);
        } else if (!planId) {
          e.preventDefault();
          toast.error(t.noPlanSelected);
        }
      }}
      className="space-y-6"
    >
      {/* ── Personal info ── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid size-8 place-items-center rounded-lg bg-brand/15 text-brand">
              <User className="size-4" />
            </span>
            {t.personalInfo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.fullName} htmlFor="name" error={err("name")}>
              <IconInput icon={User}>
                <Input
                  id="name"
                  name="name"
                  required
                  autoComplete="off"
                  className="ps-10"
                />
              </IconInput>
            </Field>
            <Field label={t.gender} htmlFor="gender" error={err("gender")}>
              <GenderToggle value={gender} onChange={setGender} dict={dict} />
            </Field>
            <Field label={dict.common.phone} htmlFor="phone" error={err("phone")}>
              <IconInput icon={Phone}>
                <Input
                  id="phone"
                  name="phone"
                  required
                  inputMode="tel"
                  dir="ltr"
                  placeholder={t.phonePlaceholder}
                  className="ps-10 text-start"
                />
              </IconInput>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t.age} htmlFor="age" error={err("age")}>
                <IconInput icon={Cake}>
                  <Input
                    id="age"
                    name="age"
                    type="number"
                    min={1}
                    max={120}
                    inputMode="numeric"
                    required
                    className="ps-9"
                  />
                </IconInput>
              </Field>
              <Field label={t.height} htmlFor="height" error={err("height")}>
                <IconInput icon={Ruler}>
                  <Input
                    id="height"
                    name="height"
                    type="number"
                    step="0.1"
                    min={1}
                    inputMode="decimal"
                    required
                    className="ps-9"
                  />
                </IconInput>
              </Field>
              <Field label={t.weight} htmlFor="weight" error={err("weight")}>
                <IconInput icon={Weight}>
                  <Input
                    id="weight"
                    name="weight"
                    type="number"
                    step="0.1"
                    min={1}
                    inputMode="decimal"
                    required
                    className="ps-9"
                  />
                </IconInput>
              </Field>
            </div>
          </div>

          {gender === "FEMALE" && (
            <FemaleMeasurementFields dict={dict} errors={state.fieldErrors} />
          )}
        </CardContent>
      </Card>

      {/* ── Subscription & payment ── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid size-8 place-items-center rounded-lg bg-brand/15 text-brand">
              <CreditCard className="size-4" />
            </span>
            {t.subscriptionInfo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>{t.selectPlan}</Label>
            <PlanPicker
              plans={plans}
              value={planId}
              onChange={setPlanId}
              dict={dict}
              locale={locale}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t.paymentMethod}</Label>
              <PaymentMethodToggle
                value={method}
                onChange={setMethod}
                dict={dict}
              />
            </div>

            <div
              className={cn(
                "space-y-2 transition-opacity",
                method === "DEFERRED"
                  ? "opacity-100"
                  : "pointer-events-none opacity-40",
              )}
            >
              <Label htmlFor="amountReceived">{t.amountReceived}</Label>
              <MoneyInput
                id="amountReceived"
                name="amountReceived"
                max={total || undefined}
                value={method === "DEFERRED" ? received : ""}
                onValueChange={setReceived}
                disabled={method !== "DEFERRED"}
                suffix={dict.common.currency}
              />
              {method === "DEFERRED" && (
                <p className="text-xs text-muted-foreground">
                  {t.deferredHint}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary + submit (below the form) ── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-brand/20 to-transparent px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="size-4 text-brand" />
            {t.summary}
          </p>
          <p className="text-lg font-bold tracking-tight">
            {plan ? (
              <>
                {plan.name}
                <span className="ms-2 text-sm font-normal text-muted-foreground">
                  · {plan.durationDays} {dict.common.days}
                </span>
              </>
            ) : (
              <span className="text-base font-medium text-muted-foreground">
                {t.choosePlan}
              </span>
            )}
          </p>
        </div>
        <CardContent className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center">
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryTile
              icon={CalendarDays}
              label={t.startsOn}
              value={formatDate(new Date(today), locale)}
            />
            <SummaryTile
              icon={CalendarCheck}
              label={t.expiresOn}
              value={endDate ? formatDate(endDate, locale) : "—"}
            />
            <SummaryTile label={t.totalDue} value={money(total)} />
            <SummaryTile
              label={t.amountReceived}
              value={money(receivedNum)}
              tone="success"
            />
            <SummaryTile
              label={t.remaining}
              value={money(remaining)}
              tone={remaining > 0 ? "warning" : "success"}
              highlight
            />
          </div>
          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="w-full lg:w-auto lg:min-w-52"
            disabled={pending || plans.length === 0}
          >
            <UserPlus className="size-4" />
            {pending ? dict.common.saving : t.register}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && (
          <span className="ms-1 text-xs font-normal text-muted-foreground">
            ({optional})
          </span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function IconInput({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      {children}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
  highlight,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "success" | "warning";
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-3",
        highlight ? "bg-muted/60 ring-1 ring-border" : "bg-muted/30",
      )}
    >
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-bold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          highlight && "text-base",
        )}
      >
        {value}
      </p>
    </div>
  );
}
