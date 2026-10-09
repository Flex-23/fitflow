"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Plus, Receipt, Trash2, Wallet, Check, X, Tag, Info, Pencil } from "lucide-react";
import { MonthPicker } from "@/components/ui/month-picker";
import { createExpense, updateExpense, deleteExpense } from "@/app/actions/expenses";
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
  title: string | null;
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
  dict,
  locale,
}: {
  rows: ExpenseRow[];
  /** YYYY-MM currently being viewed. */
  month: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.finance;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
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
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[30%]">{t.expenseTitle}</TableHead>
                <TableHead className="w-[14%]">{t.expenseCategory}</TableHead>
<TableHead justify="end" className="w-[17%]">{t.expenseAmount}</TableHead>
<TableHead justify="center" className="w-[17%]">{t.expenseDate}</TableHead>
                <TableHead justify="end" className="w-[17%]">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e, i) => (
                <TableRow key={e.id}>
                  <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="truncate font-medium">
                      {e.title ?? t.categories[e.category]}
                    </div>
                    {e.note && e.note !== e.title && (
                      <div className="truncate text-xs text-muted-foreground">{e.note}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={categoryTone[e.category]} className="gap-1">
                      <Tag className="size-3" />
                      {t.categories[e.category]}
                    </Badge>
                  </TableCell>
                  <TableCell justify="end" className="whitespace-nowrap font-bold text-destructive">
                    {money(e.amount)}
                  </TableCell>
                  <TableCell justify="center" className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(e.spentAt, locale)}
                  </TableCell>
                  <TableCell justify="end">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={dict.common.edit}
                        aria-label={dict.common.edit}
                        onClick={() => setEditing(e)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <DeleteExpense id={e.id} dict={dict} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t.newExpense}>
        <ExpenseForm dict={dict} onDone={() => setOpen(false)} />
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={t.editExpense}>
        {editing && (
          <ExpenseForm
            key={editing.id}
            dict={dict}
            expense={editing}
            onDone={() => setEditing(null)}
          />
        )}
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

/**
 * Record a spend, or correct one.
 *
 * The same form both ways: an expense that already exists arrives filled in.
 * There is no "what was it for" box — the category answers that, and the one
 * category that does not answer it is "other", which the note covers. The
 * server lifts that note into the title.
 */
function ExpenseForm({
  dict,
  expense,
  onDone,
}: {
  dict: Dictionary;
  /** Present when correcting an entry rather than adding one. */
  expense?: ExpenseRow;
  onDone: () => void;
}) {
  const t = dict.finance;
  const editing = expense !== undefined;
  const [category, setCategory] = useState<ExpenseCategoryKey>(expense?.category ?? "OTHER");
  const [state, action, pending] = useActionState(
    editing ? updateExpense : createExpense,
    emptyState
  );
  // Always default a new entry to today's (local) date, whatever month is open.
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

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
      {editing && <input type="hidden" name="id" value={expense.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount">{t.expenseAmount}</Label>
          <MoneyInput
            id="amount"
            name="amount"
            min={1}
            required
            defaultValue={expense?.amount}
            suffix={dict.common.currency}
          />
          {err("amount") && (
            <p className="text-xs text-destructive">{dict.reception.invalidField}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">{t.expenseCategory}</Label>
          <Select
            id="category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategoryKey)}
            required
          >
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
        <Input
          id="spentAt"
          name="spentAt"
          type="date"
          defaultValue={expense ? expense.spentAt.slice(0, 10) : today}
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        {/* For "other" this is the only place the reason can go, so it is
            asked for rather than offered. */}
        <Label htmlFor="note">
          {category === "OTHER" ? t.expenseReason : t.expenseNote}{" "}
          {category !== "OTHER" && (
            <span className="text-xs font-normal text-muted-foreground">
              ({dict.common.optional})
            </span>
          )}
        </Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          autoFocus
          required={category === "OTHER"}
          defaultValue={expense?.note ?? ""}
          placeholder={category === "OTHER" ? t.expenseReasonHint : undefined}
        />
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
