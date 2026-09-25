"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Plus, Receipt, Trash2, Wallet, Check, X, Tag, Info } from "lucide-react";
import { MonthPicker } from "@/components/ui/month-picker";
import { createExpense, deleteExpense } from "@/app/actions/expenses";
import { emptyState } from "@/lib/action-state";
import { EXPENSE_CATEGORIES, type ExpenseCategoryKey } from "@/schemas/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { StatTile } from "@/components/manager/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategoryKey;
  note: string | null;
  spentAt: string;
  createdByName: string | null;
};

/** "2026/9", matching the numeric dates the rest of the app prints. */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}/${m ?? 1}`;
}

const categoryTone: Record<ExpenseCategoryKey, "secondary" | "warning" | "muted" | "brand"> = {
  RENT: "warning",
  SALARY: "brand",
  EQUIPMENT: "secondary",
  MAINTENANCE: "secondary",
  UTILITIES: "warning",
  SUPPLIES: "muted",
  OTHER: "muted",
};

export function ExpensesManager({
  rows,
  month,
  monthStart,
  dict,
  locale,
}: {
  rows: ExpenseRow[];
  /** YYYY-MM currently being viewed. */
  month: string;
  /** First day of that month, used as the default date for a new entry. */
  monthStart: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.finance;
  const [open, setOpen] = useState(false);
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const monthTotal = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);
  const topCategory = useMemo(() => {
    const byCat = new Map<ExpenseCategoryKey, number>();
    for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
    return [...byCat.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MonthPicker
          value={month}
          locale={locale}
          labels={{ prev: t.prevMonth, next: t.nextMonth, current: t.currentMonth }}
        />
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {t.newExpense}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={Wallet}
          label={t.totalExpenses}
          value={money(monthTotal)}
          hint={formatMonthLabel(month)}
          tone="destructive"
        />
        <StatTile icon={Receipt} label={t.movements} value={String(rows.length)} tone="brand" />
        <StatTile
          icon={Tag}
          label={t.byCategory}
          value={topCategory ? t.categories[topCategory[0]] : "—"}
          hint={topCategory ? money(topCategory[1]) : undefined}
          tone="warning"
        />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        {t.monthOnly} {t.olderMonths}
      </p>

      <SearchInput placeholder={t.expenseTitle} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t.noExpenses}
          description={t.noExpensesDesc}
          action={
            <Button variant="brand" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {t.newExpense}
            </Button>
          }
        />
      ) : (
        <Card>
          <Table className="min-w-[48rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[5%] text-center">#</TableHead>
                <TableHead className="w-[30%]">{t.expenseTitle}</TableHead>
                <TableHead className="w-[14%]">{t.expenseCategory}</TableHead>
                <TableHead className="w-[17%]">{t.expenseAmount}</TableHead>
                <TableHead className="w-[17%]">{t.expenseDate}</TableHead>
                <TableHead className="w-[17%] text-end">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e, i) => (
                <TableRow key={e.id}>
                  <TableCell className="text-center text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="truncate font-medium">{e.title}</div>
                    {e.note && (
                      <div className="truncate text-xs text-muted-foreground">{e.note}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={categoryTone[e.category]} className="gap-1">
                      <Tag className="size-3" />
                      {t.categories[e.category]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-bold text-destructive">
                    {money(e.amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(e.spentAt, locale)}
                  </TableCell>
                  <TableCell className="text-end">
                    <DeleteExpense id={e.id} dict={dict} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t.newExpense}>
        <ExpenseForm dict={dict} monthStart={monthStart} onDone={() => setOpen(false)} />
      </Dialog>
    </div>
  );
}

function DeleteExpense({ id, dict }: { id: string; dict: Dictionary }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-xs text-destructive">{dict.finance.confirmDeleteExpense}</span>
        <Button
          variant="destructive"
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteExpense(id);
              if (res.ok) toast.success(dict.finance.expenseDeleted);
              else toast.error(dict.common.somethingWrong);
              setConfirming(false);
            })
          }
        >
          <Check />
          {dict.common.yes}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setConfirming(false)} disabled={pending}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <Button variant="soft-destructive" size="xs" onClick={() => setConfirming(true)}>
      <Trash2 />
      {dict.common.delete}
    </Button>
  );
}

function ExpenseForm({
  dict,
  monthStart,
  onDone,
}: {
  dict: Dictionary;
  monthStart: string;
  onDone: () => void;
}) {
  const t = dict.finance;
  const [state, action, pending] = useActionState(createExpense, emptyState);
  // Default to today, or to the 1st when browsing a past month.
  const today = useMemo(() => {
    const now = new Date();
    const nowKey = now.toISOString().slice(0, 10);
    return nowKey.slice(0, 7) === monthStart.slice(0, 7) ? nowKey : monthStart.slice(0, 10);
  }, [monthStart]);

  useEffect(() => {
    if (state.ok) {
      toast.success(t.expenseSaved);
      onDone();
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t.expenseSaved, dict.common.somethingWrong]);

  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">{t.expenseTitle}</Label>
        <Input id="title" name="title" required autoFocus />
        {err("title") && <p className="text-xs text-destructive">{dict.reception.invalidField}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount">{t.expenseAmount}</Label>
          <MoneyInput id="amount" name="amount" min={1} required suffix={dict.common.currency} />
          {err("amount") && (
            <p className="text-xs text-destructive">{dict.reception.invalidField}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">{t.expenseCategory}</Label>
          <Select id="category" name="category" defaultValue="OTHER" required>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.categories[c]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="spentAt">{t.expenseDate}</Label>
        <Input id="spentAt" name="spentAt" type="date" defaultValue={today} dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">
          {t.expenseNote}{" "}
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
