"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, IdCard, Trash2 } from "lucide-react";
import type { SubscriptionStatus } from "@prisma/client";
import { removeCardAction } from "@/app/actions/gate-hybrid";
import { StatusBadge } from "@/components/reception/status-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Dictionary } from "@/lib/i18n";

export type CardRow = {
  id: string;
  name: string;
  phone: string;
  card: string;
  /** Their most relevant subscription, or null if they never had one. */
  status: SubscriptionStatus | null;
};

/** Who is currently synced onto the panel's own memory (or would be, once
 *  the bridge next runs) — updates on its own as the underlying data does. */
const LIVE_REFRESH_MS = 5000;

export function GateCards({ rows, dict }: { rows: CardRow[]; dict: Dictionary }) {
  const t = dict.gate;
  const router = useRouter();

  // The list is a read of live data — a renewal, freeze or new card anywhere
  // else in the app should show up here without a manual reload.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  async function remove(id: string) {
    if (!window.confirm(t.removeCardConfirm)) return;
    const formData = new FormData();
    formData.set("id", id);
    await removeCardAction(formData);
    toast.success(t.cardRemoved);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Badge variant="secondary" className="gap-1.5">
        <CreditCard className="size-3.5" />
        {rows.length} {t.cardsCount}
      </Badge>

      {rows.length === 0 ? (
        <EmptyState icon={CreditCard} title={t.noCards} description={t.noCardsDesc} />
      ) : (
        <Card>
          <Table className="min-w-[36rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34%]">{t.member}</TableHead>
                <TableHead className="w-[20%]">{t.card}</TableHead>
                <TableHead className="w-[26%]">{dict.reception.subscriptionInfo}</TableHead>
                <TableHead justify="center" className="w-[20%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {r.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground" dir="ltr">
                      <IdCard className="size-3.5" />
                      {r.card}
                    </span>
                  </TableCell>
                  <TableCell>
                    {r.status ? (
                      <StatusBadge status={r.status} dict={dict} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.noSubscription}</span>
                    )}
                  </TableCell>
                  <TableCell justify="center">
                    <Button
                      type="button"
                      variant="soft-destructive"
                      size="xs"
                      onClick={() => remove(r.id)}
                    >
                      <Trash2 />
                      {t.removeCard}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
