"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  Plus,
  HandCoins,
  Users,
  CheckCheck,
  Phone,
  Trash2,
  Check,
  X,
  Receipt,
} from "lucide-react";
import { createDebt, addDebtPayment, deleteDebt } from "@/app/actions/debts";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import type { PageInfo } from "@/lib/pagination";
import { StatTile } from "@/components/manager/stat-tile";
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

export type DebtRow = {
  id: string;
  personName: string;
  phone: string;
  amount: number;
  paid: number;
  remaining: number;
  note: string | null;
  createdAt: string;
  payments: { id: string; amount: number; note: string | null; createdAt: string }[];
};

export function DebtsManager({
  rows,
  totals,
  paging,
  dict,
  locale,
}: {
  rows: DebtRow[];
  /** Across all debts, not only the visible page. */
  totals: { outstanding: number; collected: number; people: number };
  paging: PageInfo;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.finance;
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<DebtRow | null>(null);
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={HandCoins} label={t.outstandingDebts} value={money(totals.outstanding)} tone="warning" />
        <StatTile icon={CheckCheck} label={dict.reception.received} value={money(totals.collected)} tone="success" />
        <StatTile icon={Users} label={t.peopleWithDebt} value={String(totals.people)} tone="brand" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder={dict.reception.searchMembers} />
        <Button variant="brand" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t.newDebt}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={t.noDebts}
          description={t.noDebtsDesc}
          action={
            <Button variant="brand" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t.newDebt}
            </Button>
          }
        />
      ) : (
        <Card>
          <Table className="min-w-[52rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[22%]">{t.debtPerson}</TableHead>
                <TableHead className="w-[15%]">{t.debtAmount}</TableHead>
                <TableHead className="w-[20%]">{dict.reception.received}</TableHead>
                <TableHead className="w-[14%]">{dict.reception.remaining}</TableHead>
                <TableHead justify="end" className="w-[24%]">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d, i) => {
                const pct = d.amount > 0 ? Math.min(100, Math.round((d.paid / d.amount) * 100)) : 0;
                const settled = d.remaining <= 0;
                return (
                  <TableRow key={d.id} className={settled ? "opacity-70" : ""}>
                    <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                      {paging.from + i}
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{d.personName}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        <span dir="ltr" className="tabular-nums">
                          {d.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {money(d.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-success">{money(d.paid)}</span>
                        <span className="text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {settled ? (
                        <Badge variant="success">{t.settled}</Badge>
                      ) : (
                        <span className="font-bold text-warning">{money(d.remaining)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {!settled && (
                          <Button variant="soft-brand" size="xs" onClick={() => setPaying(d)}>
                            <Plus />
                            {t.addDebtPayment}
                          </Button>
                        )}
                        <DeleteDebt id={d.id} dict={dict} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination info={paging} locale={locale} labels={dict.common.pager} />

      <Dialog open={creating} onClose={() => setCreating(false)} title={t.newDebt}>
        <DebtForm dict={dict} locale={locale} onDone={() => setCreating(false)} />
      </Dialog>

      <Dialog
        open={!!paying}
        onClose={() => setPaying(null)}
        title={t.addDebtPaymentTitle}
      >
        {paying && (
          <DebtPaymentForm
            key={paying.id}
            debt={paying}
            dict={dict}
            locale={locale}
            onDone={() => setPaying(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function DeleteDebt({ id, dict }: { id: string; dict: Dictionary }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (confirming) {
    return (
      <>
        <span className="text-xs text-destructive">{dict.finance.confirmDeleteDebt}</span>
        <Button
          variant="destructive"
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteDebt(id);
              if (res.ok) toast.success(dict.finance.debtDeleted);
              else toast.error(dict.common.somethingWrong);
              setConfirming(false);
            })
          }
        >
          <Check />
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setConfirming(false)} disabled={pending}>
          <X />
        </Button>
      </>
    );
  }

  return (
    <Button variant="soft-destructive" size="xs" onClick={() => setConfirming(true)}>
      <Trash2 />
    </Button>
  );
}

/* ───────────────────────── New debt ───────────────────────── */

function DebtForm({
  dict,
  locale,
  onDone,
}: {
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
}) {
  const t = dict.finance;
  const [state, action, pending] = useActionState(createDebt, emptyState);
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  const total = Number(amount || 0);
  const paid = Math.min(Number(received || 0), total);
  const remaining = Math.max(0, total - paid);

  useEffect(() => {
    if (state.ok) {
      toast.success(t.debtSaved);
      onDone();
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t.debtSaved, dict.common.somethingWrong]);

  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="personName">{t.debtPerson}</Label>
          <Input id="personName" name="personName" required autoFocus />
          {err("personName") && (
            <p className="text-xs text-destructive">{dict.reception.invalidField}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t.debtPhone}</Label>
          <Input
            id="phone"
            name="phone"
            required
            inputMode="tel"
            dir="ltr"
            placeholder={dict.reception.phonePlaceholder}
            className="text-start"
          />
          {err("phone") && (
            <p className="text-xs text-destructive">{dict.reception.invalidField}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">{t.debtAmount}</Label>
          <MoneyInput
            id="amount"
            name="amount"
            min={1}
            required
            value={amount}
            onValueChange={setAmount}
            suffix={dict.common.currency}
          />
          {err("amount") && (
            <p className="text-xs text-destructive">{dict.reception.invalidField}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="received">{t.debtReceived}</Label>
          <MoneyInput
            id="received"
            name="received"
            max={total || undefined}
            value={received}
            onValueChange={setReceived}
            suffix={dict.common.currency}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t.debtReceivedHint}</p>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">{t.debtAmount}</p>
          <p className="font-semibold">{money(total)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">{dict.reception.received}</p>
          <p className="font-semibold text-success">{money(paid)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">{dict.reception.remaining}</p>
          <p className={cn("font-bold", remaining > 0 ? "text-warning" : "text-success")}>
            {money(remaining)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">
          {t.debtNote}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({dict.common.optional})
          </span>
        </Label>
        <Textarea id="note" name="note" rows={2} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          <Plus className="size-4" />
          {pending ? dict.common.saving : dict.common.save}
        </Button>
      </div>
    </form>
  );
}

/* ───────────────────────── Instalment ───────────────────────── */

function DebtPaymentForm({
  debt,
  dict,
  locale,
  onDone,
}: {
  debt: DebtRow;
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
}) {
  const t = dict.finance;
  const [state, action, pending] = useActionState(addDebtPayment, emptyState);
  const [amount, setAmount] = useState("");
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const newRemaining = Math.max(0, debt.remaining - Number(amount || 0));

  useEffect(() => {
    if (state.ok) {
      toast.success(t.debtPaymentAdded);
      onDone();
    } else if (state.error === "already_settled") {
      toast.error(t.settled);
      onDone();
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t, dict.common.somethingWrong]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="debtId" value={debt.id} />

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">{debt.personName}</p>
        <p className="text-xs text-muted-foreground" dir="ltr">
          {debt.phone}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">{t.debtAmount}</p>
            <p className="font-semibold">{money(debt.amount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{dict.reception.received}</p>
            <p className="font-semibold text-success">{money(debt.paid)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{dict.reception.remaining}</p>
            <p className="font-semibold text-warning">{money(debt.remaining)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="amount">{t.expenseAmount}</Label>
          <button
            type="button"
            onClick={() => setAmount(String(debt.remaining))}
            className="text-xs font-medium text-brand hover:underline"
          >
            {t.payFullDebt}
          </button>
        </div>
        <MoneyInput
          id="amount"
          name="amount"
          min={1}
          max={debt.remaining}
          required
          autoFocus
          value={amount}
          onValueChange={setAmount}
          suffix={dict.common.currency}
          className="h-12 text-lg"
        />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{dict.reception.remaining}</span>
          <span className={cn("font-semibold", newRemaining === 0 && "text-success")}>
            {money(newRemaining)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">
          {dict.common.notes}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({dict.common.optional})
          </span>
        </Label>
        <Input id="note" name="note" />
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Receipt className="size-3.5" />
          {t.debtHistory}
        </p>
        {debt.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noDebtPayments}</p>
        ) : (
          <ul className="scroll-quiet max-h-36 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {debt.payments.map((p) => (
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
        <p className="text-xs text-muted-foreground">
          {t.recorded} {formatDate(debt.createdAt, locale)}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          <Plus className="size-4" />
          {pending ? dict.common.saving : t.addDebtPayment}
        </Button>
      </div>
    </form>
  );
}
