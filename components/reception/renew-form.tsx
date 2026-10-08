"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { RotateCw, Info, ArrowLeft, ArrowRight } from "lucide-react";
import { renewSubscription } from "@/app/actions/subscriptions";
import { emptyState, DAY_MS } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { PlanPicker, type PlanOption } from "@/components/reception/plan-picker";
import {
  PaymentMethodToggle,
  type PaymentMethod,
} from "@/components/reception/payment-method-toggle";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type RenewTarget = {
  memberId: string;
  memberName: string;
  phone: string;
  /** Latest subscription, if any — shown for context and used to detect early renewal. */
  currentPlanName: string | null;
  currentEndDate: string | null;
};

/**
 * Renew (or extend) a member's subscription. When the current subscription is
 * still running, the new one is projected to start at its end date — mirrors
 * the server-side logic in `renewSubscription`.
 */
export function RenewForm({
  target,
  plans,
  dict,
  locale,
  onDone,
  onBack,
}: {
  target: RenewTarget;
  plans: PlanOption[];
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
  /** When set, a back button replaces "cancel" (used inside the details dialog). */
  onBack?: () => void;
}) {
  const t = dict.reception;
  const BackArrow = locale === "ar" ? ArrowRight : ArrowLeft;
  const [state, action, pending] = useActionState(renewSubscription, emptyState);
  const [planId, setPlanId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [received, setReceived] = useState("");
  const [today] = useState(() => Date.now());

  const plan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
  const total = plan?.price ?? 0;
  const receivedNum = method === "CASH" ? total : Math.min(Number(received || 0), total);
  const remaining = Math.max(0, total - receivedNum);

  const currentEnd = target.currentEndDate ? new Date(target.currentEndDate).getTime() : null;
  const early = currentEnd != null && currentEnd > today;
  const startMs = early ? currentEnd : today;
  const endDate = plan ? new Date(startMs + plan.durationDays * DAY_MS) : null;
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  useEffect(() => {
    if (state.ok) {
      toast.success(t.renewed);
      onDone();
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t.renewed, dict.common.somethingWrong]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!planId) {
          e.preventDefault();
          toast.error(t.noPlanSelected);
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="memberId" value={target.memberId} />

      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
        <div>
          <p className="font-medium">{target.memberName}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {target.phone}
          </p>
        </div>
        {target.currentPlanName && target.currentEndDate && (
          <div className="text-end text-xs text-muted-foreground">
            <p>{target.currentPlanName}</p>
            <p>{formatDate(target.currentEndDate, locale)}</p>
          </div>
        )}
      </div>

      {early && currentEnd && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {t.renewEarlyNote.replace("{date}", formatDate(new Date(currentEnd), locale))}
        </p>
      )}

      <div className="space-y-2">
        <Label>{t.selectPlan}</Label>
        <PlanPicker plans={plans} value={planId} onChange={setPlanId} dict={dict} locale={locale} compact />
      </div>

      <div className="space-y-2">
        <Label>{t.paymentMethod}</Label>
        <PaymentMethodToggle value={method} onChange={setMethod} dict={dict} />
      </div>

      {method === "DEFERRED" && (
        <div className="space-y-2">
          <Label htmlFor="amountReceived">{t.amountReceived}</Label>
          <MoneyInput
            id="amountReceived"
            name="amountReceived"
            max={total || undefined}
            value={received}
            onValueChange={setReceived}
            suffix={dict.common.currency}
          />
        </div>
      )}

      <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t.startsOn}</span>
          <span className="font-medium">{formatDate(new Date(startMs), locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t.expiresOn}</span>
          <span className="font-medium">{endDate ? formatDate(endDate, locale) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t.totalDue}</span>
          <span className="font-medium">{money(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t.remaining}</span>
          <span className={cn("font-bold", remaining > 0 ? "text-warning" : "text-success")}>
            {money(remaining)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            <BackArrow className="size-4" />
            {t.backToDetails}
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onDone}>
            {dict.common.cancel}
          </Button>
        )}
        <Button type="submit" variant="brand" disabled={pending}>
          <RotateCw className="size-4" />
          {pending ? dict.common.saving : t.renewCta}
        </Button>
      </div>
    </form>
  );
}
