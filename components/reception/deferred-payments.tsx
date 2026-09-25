"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Wallet, Plus, Phone, Users, Receipt, CheckCheck } from "lucide-react";
import type { SubscriptionStatus } from "@prisma/client";
import { addPayment } from "@/app/actions/payments";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/reception/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type DeferredRow = {
  id: string;
  memberName: string;
  phone: string;
  planName: string;
  status: SubscriptionStatus;
  endDate: string;
  total: number;
  received: number;
  remaining: number;
  payments: { id: string; amount: number; note: string | null; createdAt: string }[];
};

export function DeferredPayments({
  rows,
  dict,
  locale,
  canSeeTotals,
}: {
  rows: DeferredRow[];
  dict: Dictionary;
  locale: Locale;
  /** Money columns and totals are manager-only. */
  canSeeTotals: boolean;
}) {
  const t = dict.reception;
  const [selected, setSelected] = useState<DeferredRow | null>(null);
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  const totals = useMemo(
    () => ({
      outstanding: rows.reduce((a, r) => a + r.remaining, 0),
      received: rows.reduce((a, r) => a + r.received, 0),
    }),
    [rows]
  );

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {canSeeTotals ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={Wallet}
            label={t.totalOutstanding}
            value={money(totals.outstanding)}
            tone="warning"
          />
          <SummaryCard
            icon={CheckCheck}
            label={t.received}
            value={money(totals.received)}
            tone="success"
          />
          <SummaryCard
            icon={Users}
            label={t.membersWithBalance}
            value={`${rows.length}`}
            tone="brand"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={Users}
            label={t.membersWithBalance}
            value={`${rows.length}`}
            tone="brand"
          />
        </div>
      )}

      <SearchInput placeholder={t.searchMembers} />

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title={t.noDeferred} description={t.noDeferredDesc} />
      ) : (
        <Card>
          <Table className="min-w-[52rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[20%]">{t.member}</TableHead>
                <TableHead className="w-[17%]">{t.selectPlan}</TableHead>
                <TableHead justify="center" className="w-[12%]">{dict.common.status}</TableHead>
                <TableHead className="w-[20%]">{t.received}</TableHead>
                <TableHead justify="end" className="w-[13%]">{t.remaining}</TableHead>
                <TableHead justify="end" className="w-[13%]">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const pct = r.total > 0 ? Math.min(100, Math.round((r.received / r.total) * 100)) : 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{r.memberName}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        <span dir="ltr" className="tabular-nums">{r.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{r.planName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t.expiresOn} {formatDate(r.endDate, locale)}
                      </div>
                    </TableCell>
                    <TableCell justify="center">
                      <StatusBadge status={r.status} dict={dict} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-success">{money(r.received)}</span>
                        <span className="text-muted-foreground">/ {money(r.total)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell justify="end" className="whitespace-nowrap font-bold tabular-nums text-warning">
                      {money(r.remaining)}
                    </TableCell>
                    <TableCell justify="end">
                      <Button variant="soft-brand" size="xs" onClick={() => setSelected(r)}>
                        <Plus />
                        {t.addPayment}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t.addPaymentTitle}
        description={t.addPaymentDesc}
      >
        {selected && (
          <PaymentForm
            key={selected.id}
            row={selected}
            dict={dict}
            locale={locale}
            onDone={() => setSelected(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "warning" | "success" | "brand";
}) {
  const tones = {
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    brand: "bg-brand/15 text-brand",
  };
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-bold tracking-tight">{value}</p>
      </div>
    </Card>
  );
}

/** A member's own balance is always shown — only gym-wide totals are gated. */
function PaymentForm({
  row,
  dict,
  locale,
  onDone,
}: {
  row: DeferredRow;
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
}) {
  const t = dict.reception;
  const [state, action, pending] = useActionState(addPayment, emptyState);
  const [amount, setAmount] = useState("");
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const newRemaining = Math.max(0, row.remaining - Number(amount || 0));

  useEffect(() => {
    if (state.ok) {
      toast.success(t.paymentAdded);
      onDone();
    } else if (state.error === "already_settled") {
      toast.error(t.noDeferred);
      onDone();
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t, dict.common.somethingWrong]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="subscriptionId" value={row.id} />

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">{row.memberName}</p>
        <p className="text-xs text-muted-foreground">{row.planName}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">{t.totalDue}</p>
            <p className="font-semibold">{money(row.total)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t.received}</p>
            <p className="font-semibold text-success">{money(row.received)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t.remaining}</p>
            <p className="font-semibold text-warning">{money(row.remaining)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="amount">{t.amount}</Label>
          <button
            type="button"
            onClick={() => setAmount(String(row.remaining))}
            className="text-xs font-medium text-brand hover:underline"
          >
            {t.payFull}
          </button>
        </div>
        <MoneyInput
          id="amount"
          name="amount"
          min={1}
          max={row.remaining}
          required
          autoFocus
          value={amount}
          onValueChange={setAmount}
          suffix={dict.common.currency}
          className="h-12 text-lg"
        />
        {/* What will still be owed once this payment is recorded. */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t.remainingAfter}</span>
          <span
            className={cn(
              "text-base font-bold",
              newRemaining === 0 ? "text-success" : "text-warning"
            )}
          >
            {money(newRemaining)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">
          {dict.common.notes}{" "}
          <span className="text-muted-foreground">({dict.common.optional})</span>
        </Label>
        <Input id="note" name="note" />
      </div>

      <Separator />
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Receipt className="size-3.5" />
          {t.paymentHistory}
        </p>
        {row.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noPayments}</p>
        ) : (
          <ul className="scroll-quiet max-h-36 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {row.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-success">+{money(p.amount)}</p>
                  {p.note && <p className="truncate text-xs text-muted-foreground">{p.note}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(p.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          <Plus className="size-4" />
          {pending ? dict.common.saving : t.addPayment}
        </Button>
      </div>
    </form>
  );
}
