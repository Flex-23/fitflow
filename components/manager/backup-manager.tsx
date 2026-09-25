"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DatabaseBackup,
  Download,
  RotateCcw,
  Trash2,
  Check,
  X,
  Info,
  ShieldAlert,
  Clock,
  HardDrive,
  Users,
  BadgeCheck,
  KeyRound,
} from "lucide-react";
import { makeBackup, removeBackup, restoreFromBackup } from "@/app/actions/backup";
import type { BackupInfo } from "@/lib/backup";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

function formatSize(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024), locale)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupManager({
  backups,
  dict,
  locale,
  canRestore,
}: {
  backups: BackupInfo[];
  dict: Dictionary;
  locale: Locale;
  /**
   * Whether this person may put a snapshot back. Managers take them; only
   * the master restores one, so for everyone else the button is not there
   * to be pressed by mistake.
   */
  canRestore: boolean;
}) {
  const t = dict.backup;
  const router = useRouter();
  const [creating, startCreate] = useTransition();
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);

  const create = () =>
    startCreate(async () => {
      const res = await makeBackup();
      if (res.ok) {
        toast.success(t.created);
        router.refresh();
      } else toast.error(t.failed);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" />
          {t.autoNote}
        </p>
        <Button variant="brand" onClick={create} disabled={creating}>
          <DatabaseBackup className="size-4" />
          {creating ? t.creating : t.createNow}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Info className="size-4 text-brand" />
            {t.whatIsSaved}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.savedItems}</p>
        </Card>
        <Card className="p-4 border-warning/40 bg-warning/5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-warning" />
            {dict.videos.title}
          </h3>
        </Card>
      </div>

      {backups.length === 0 ? (
        <EmptyState
          icon={DatabaseBackup}
          title={t.noBackups}
          action={
            <Button variant="brand" onClick={create} disabled={creating}>
              <DatabaseBackup className="size-4" />
              {creating ? t.creating : t.createNow}
            </Button>
          }
        />
      ) : (
        <Card>
          <Table className="min-w-[52rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[22%]">{t.when}</TableHead>
                <TableHead className="w-[25%]">{t.file}</TableHead>
                <TableHead className="w-[10%]">{t.size}</TableHead>
                <TableHead justify="center" className="w-[9%]">{t.members}</TableHead>
                <TableHead justify="center" className="w-[9%]">{t.subscriptions}</TableHead>
                <TableHead justify="end" className="w-[20%]">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b, i) => (
                <TableRow key={b.name}>
                  <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {formatDateTime(b.createdAt, locale)}
                  </TableCell>
                  <TableCell>
                    <span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">
                      {b.name}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <HardDrive className="size-3.5" />
                      {formatSize(b.size, locale)}
                    </span>
                  </TableCell>
                  <TableCell justify="center">
                    {b.counts ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Users className="size-3.5 text-muted-foreground" />
                        {formatNumber(b.counts.member ?? 0, locale)}
                      </span>
                    ) : (
                      <span className="text-xs text-destructive">{t.corrupt}</span>
                    )}
                  </TableCell>
                  <TableCell justify="center">
                    {b.counts ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <BadgeCheck className="size-3.5 text-muted-foreground" />
                        {formatNumber(b.counts.subscription ?? 0, locale)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell justify="end">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild variant="soft" size="xs" title={t.download}>
                        <a href={`/api/backup/${encodeURIComponent(b.name)}`} download={b.name}>
                          <Download />
                          {t.download}
                        </a>
                      </Button>
                      {canRestore && (
                        <Button
                          variant="soft-warning"
                          size="xs"
                          disabled={!b.counts}
                          onClick={() => setRestoring(b)}
                        >
                          <RotateCcw />
                          {t.restore}
                        </Button>
                      )}
                      <DeleteBackup name={b.name} dict={dict} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={t.restoreTitle}
        description={restoring ? formatDateTime(restoring.createdAt, locale) : undefined}
      >
        {restoring && (
          <RestoreForm
            key={restoring.name}
            backup={restoring}
            dict={dict}
            locale={locale}
            onDone={() => setRestoring(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function RestoreForm({
  backup,
  dict,
  locale,
  onDone,
}: {
  backup: BackupInfo;
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
}) {
  const t = dict.backup;
  const router = useRouter();
  const [state, action, pending] = useActionState(restoreFromBackup, emptyState);

  useEffect(() => {
    if (state.ok) {
      const d = state.data as { members?: number; subscriptions?: number } | undefined;
      toast.success(
        t.restored
          .replace("{members}", formatNumber(d?.members ?? 0, locale))
          .replace("{subscriptions}", formatNumber(d?.subscriptions ?? 0, locale))
      );
      onDone();
      router.refresh();
    } else if (state.error === "wrong_password") toast.error(t.wrongPassword);
    else if (state.error === "not_found") toast.error(t.notFound);
    else if (state.error) toast.error(t.restoreFailed);
  }, [state, onDone, router, t, locale]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="name" value={backup.name} />

      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        {t.restoreWarning}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">{t.members}</dt>
        <dd className="font-semibold">{formatNumber(backup.counts?.member ?? 0, locale)}</dd>
        <dt className="text-muted-foreground">{t.subscriptions}</dt>
        <dd className="font-semibold">{formatNumber(backup.counts?.subscription ?? 0, locale)}</dd>
      </dl>

      <div className="space-y-2">
        <Label htmlFor="restore-password">{t.restorePassword}</Label>
        <Input
          id="restore-password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
        />
        {state.error === "wrong_password" && (
          <p className="text-xs text-destructive">{t.wrongPassword}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          <KeyRound className="size-4" />
          {pending ? t.restoring : t.restoreConfirm}
        </Button>
      </div>
    </form>
  );
}

function DeleteBackup({ name, dict }: { name: string; dict: Dictionary }) {
  const t = dict.backup;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="destructive"
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await removeBackup(name);
              if (res.ok) {
                toast.success(t.deleted);
                router.refresh();
              } else toast.error(dict.common.somethingWrong);
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
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-destructive"
      onClick={() => setConfirming(true)}
      title={t.deleteBackup}
    >
      <Trash2 />
    </Button>
  );
}
