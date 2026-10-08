"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Archive, RotateCcw, Tags } from "lucide-react";
import { savePlan, togglePlanActive } from "@/app/actions/plans";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type PlanRow = {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  isActive: boolean;
};

export function PlansManager({
  plans,
  dict,
  locale,
}: {
  plans: PlanRow[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.reception;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(p: PlanRow) {
    setEditing(p);
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="brand" onClick={openNew}>
          <Plus className="size-4" />
          {t.newPlan}
        </Button>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={t.noPlans}
          description={t.noPlansDesc}
          action={
            <Button variant="brand" onClick={openNew}>
              <Plus className="size-4" />
              {t.newPlan}
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%]">{t.planName}</TableHead>
                <TableHead justify="center" className="w-[16%]">
                  {t.durationDays}
                </TableHead>
                <TableHead justify="end" className="w-[18%]">
                  {dict.common.price}
                </TableHead>
                <TableHead justify="center" className="w-[14%]">
                  {dict.common.status}
                </TableHead>
                <TableHead justify="end" className="w-[20%]">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id} className={p.isActive ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell justify="center">
                    {p.durationDays} {dict.common.days}
                  </TableCell>
                  <TableCell justify="end" className="font-semibold">
                    {money(p.price)}
                  </TableCell>
                  <TableCell justify="center">
                    <Badge variant={p.isActive ? "success" : "muted"}>
                      {p.isActive ? t.activePlan : t.archivedPlan}
                    </Badge>
                  </TableCell>
                  <TableCell justify="end">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        <Pencil className="size-4" />
                        {dict.common.edit}
                      </Button>
                      <ArchiveButton plan={p} dict={dict} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t.editPlan : t.newPlan}
      >
        <PlanForm
          key={editing?.id ?? "new"}
          editing={editing}
          dict={dict}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </div>
  );
}

function ArchiveButton({ plan, dict }: { plan: PlanRow; dict: Dictionary }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => togglePlanActive(plan.id, !plan.isActive))}
    >
      {plan.isActive ? (
        <>
          <Archive className="size-4" />
          {dict.reception.archive}
        </>
      ) : (
        <>
          <RotateCcw className="size-4" />
          {dict.reception.activate}
        </>
      )}
    </Button>
  );
}

function PlanForm({
  editing,
  dict,
  onDone,
}: {
  editing: PlanRow | null;
  dict: Dictionary;
  onDone: () => void;
}) {
  const t = dict.reception;
  const [state, action, pending] = useActionState(savePlan, emptyState);

  useEffect(() => {
    if (state.ok) onDone();
    else if (state.error) toast.error(dict.common.somethingWrong);
  }, [state, onDone, dict.common.somethingWrong]);

  return (
    <form action={action} className="space-y-4">
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="space-y-2">
        <Label htmlFor="name">{t.planName}</Label>
        <Input id="name" name="name" defaultValue={editing?.name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="durationDays">{t.durationDays}</Label>
          <Input
            id="durationDays"
            name="durationDays"
            type="number"
            min={1}
            defaultValue={editing?.durationDays}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">{dict.common.price}</Label>
          <MoneyInput
            id="price"
            name="price"
            defaultValue={editing?.price}
            required
            suffix={dict.common.currency}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? dict.common.saving : dict.common.save}
        </Button>
      </div>
    </form>
  );
}
