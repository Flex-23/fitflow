"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  KeyRound,
  ShieldCheck,
  Trash2,
  Check,
  X,
  UserRound,
  Crown,
  Dumbbell,
  Headset,
} from "lucide-react";
import type { Role, Section } from "@prisma/client";
import {
  createAccount,
  updateAccount,
  resetPassword,
  toggleVideoPermission,
  deleteAccount,
} from "@/app/actions/accounts";
import { emptyState, type ActionState } from "@/lib/action-state";
import { SECTIONS } from "@/schemas/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type AccountRow = {
  id: string;
  displayName: string;
  username: string;
  role: Role;
  isActive: boolean;
  canAddVideos: boolean;
  sections: Section[];
  createdAt: string;
  isSelf: boolean;
};

const roleIcon: Record<Role, typeof Crown> = {
  // The master never appears in this roster, but the map must still cover
  // every role the type allows.
  MASTER: Crown,
  MANAGER: ShieldCheck,
  CAPTAIN: Dumbbell,
  RECEPTION: Headset,
};
const roleTone: Record<Role, "brand" | "secondary" | "muted"> = {
  MASTER: "brand",
  MANAGER: "brand",
  CAPTAIN: "secondary",
  RECEPTION: "muted",
};

/** Map an action error to the right toast text. */
function accountError(err: string | undefined, dict: Dictionary): string {
  const t = dict.manager;
  switch (err) {
    case "username_taken":
      return t.usernameTaken;
    case "self_lockout":
      return t.selfLockout;
    case "last_manager":
      return t.lastManager;
    case "invalid":
      // The field messages below say exactly which value is wrong; this only
      // has to send the manager's eyes back to the form.
      return t.checkTheFields;
    default:
      return dict.common.somethingWrong;
  }
}

/**
 * Turn a rejected field into advice. "Invalid value" is useless for rules a
 * person cannot guess — above all that a username may not be written in
 * Arabic, which is the natural thing to try first.
 */
function fieldHint(field: string, dict: Dictionary): string {
  const t = dict.manager;
  switch (field) {
    case "username":
      return t.usernameRule;
    case "password":
      return t.passwordRule;
    case "displayName":
      return t.displayNameRule;
    default:
      return dict.reception.invalidField;
  }
}

/** Reads the field errors an action sent back. */
function fieldErrors(state: ActionState, dict: Dictionary) {
  return (field: string) =>
    state.fieldErrors?.[field] ? fieldHint(field, dict) : null;
}

function FieldError({ message }: { message: string | null }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function AccountsManager({
  accounts,
  dict,
  locale,
  assignableRoles,
}: {
  assignableRoles: Role[];
  accounts: AccountRow[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.manager;
  const [mode, setMode] = useState<"create" | "edit" | "reset" | null>(null);
  const [selected, setSelected] = useState<AccountRow | null>(null);

  const roleLabel = (r: Role) => dict.roles[r.toLowerCase() as "manager" | "reception" | "captain"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="h-8 px-3 text-xs">
          <UserRound className="size-3.5" />
          {accounts.length}
        </Badge>
        <Button variant="brand" onClick={() => setMode("create")}>
          <Plus className="size-4" />
          {t.newAccount}
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t.noAccounts}
          description={t.noAccountsDesc}
          action={
            <Button variant="brand" onClick={() => setMode("create")}>
              <Plus className="size-4" />
              {t.newAccount}
            </Button>
          }
        />
      ) : (
        <Card>
          <Table className="min-w-[52rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[24%]">{t.displayName}</TableHead>
                <TableHead className="w-[15%]">{dict.auth.username}</TableHead>
                <TableHead justify="center" className="w-[13%]">
                  {t.role}
                </TableHead>
                <TableHead justify="center" className="w-[10%]">
                  {dict.common.status}
                </TableHead>
                <TableHead justify="center" className="w-[10%]">
                  {t.canAddVideos}
                </TableHead>
                <TableHead justify="end" className="w-[23%]">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a, i) => {
                const Icon = roleIcon[a.role];
                return (
                  <TableRow
                    key={a.id}
                    className={cn(
                      // The name column wraps to a second line (the "created
                      // on" date); top-aligning every cell keeps its first
                      // line level with the single-line columns next to it,
                      // instead of each cell centering independently and the
                      // text drifting out of step.
                      "[&>td]:align-top",
                      !a.isActive && "opacity-60"
                    )}
                  >
                    <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{a.displayName}</span>
                        {a.isSelf && (
                          <Badge variant="brand" className="text-[10px]">
                            {t.you}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.createdOn} {formatDate(a.createdAt, locale)}
                      </div>
                    </TableCell>
                    <TableCell dir="ltr" className="truncate text-start font-mono text-sm">
                      {a.username}
                    </TableCell>
                    <TableCell justify="center">
                      <Badge variant={roleTone[a.role]} className="gap-1">
                        <Icon className="size-3" />
                        {roleLabel(a.role)}
                      </Badge>
                    </TableCell>
                    <TableCell justify="center">
                      <Badge variant={a.isActive ? "success" : "muted"}>
                        {a.isActive ? t.activeAccount : dict.status.cancelled}
                      </Badge>
                    </TableCell>
                    <TableCell justify="center">
                      <div className="flex items-center justify-center">
                        {a.role === "CAPTAIN" ? (
                          <VideoToggle account={a} />
                        ) : a.role === "MANAGER" ? (
                          <Check className="size-4 text-success" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell justify="end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="soft"
                          size="xs"
                          onClick={() => {
                            setSelected(a);
                            setMode("edit");
                          }}
                        >
                          <Pencil />
                          {dict.common.edit}
                        </Button>
                        <Button
                          variant="soft-brand"
                          size="xs"
                          onClick={() => {
                            setSelected(a);
                            setMode("reset");
                          }}
                        >
                          <KeyRound />
                        </Button>
                        {!a.isSelf && <DeleteAccount account={a} dict={dict} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={mode === "create"} onClose={() => setMode(null)} title={t.newAccount}>
        <CreateForm
          dict={dict}
          assignableRoles={assignableRoles}
          onDone={() => setMode(null)}
        />
      </Dialog>

      <Dialog open={mode === "edit"} onClose={() => setMode(null)} title={t.editAccount}>
        {selected && (
          <EditForm
            key={selected.id}
            account={selected}
            dict={dict}
            assignableRoles={assignableRoles}
            onDone={() => setMode(null)}
          />
        )}
      </Dialog>

      <Dialog open={mode === "reset"} onClose={() => setMode(null)} title={t.resetPassword}>
        {selected && (
          <ResetForm key={selected.id} account={selected} dict={dict} onDone={() => setMode(null)} />
        )}
      </Dialog>
    </div>
  );
}

function VideoToggle({ account }: { account: AccountRow }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(account.canAddVideos);
  return (
    <Switch
      checked={checked}
      disabled={pending}
      onCheckedChange={(next) => {
        setChecked(next);
        start(() => toggleVideoPermission(account.id, next));
      }}
    />
  );
}

function DeleteAccount({ account, dict }: { account: AccountRow; dict: Dictionary }) {
  const t = dict.manager;
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="destructive"
          size="xs"
          disabled={pending}
          title={t.confirmDeleteAccount}
          onClick={() =>
            start(async () => {
              const res = await deleteAccount(account.id);
              if (res.ok) toast.success(t.accountDeleted);
              else toast.error(accountError(res.error, dict));
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
      variant="soft-destructive"
      size="xs"
      title={t.deleteAccount}
      onClick={() => setConfirming(true)}
    >
      <Trash2 />
    </Button>
  );
}

/* ───────────────────────── Forms ───────────────────────── */

function RoleSelect({
  value,
  onChange,
  dict,
  required,
  roles,
}: {
  value: Role | "";
  onChange: (r: Role) => void;
  dict: Dictionary;
  required?: boolean;
  /**
   * The roles this person may hand out, worked out on the server. Offering
   * one the server will refuse is not a choice, it is a dead end.
   */
  roles: Role[];
}) {
  return (
    <Select
      id="role"
      name="role"
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
    >
      <option value="" disabled>
        {dict.manager.chooseRole}
      </option>
      {roles.includes("RECEPTION") && (
        <option value="RECEPTION">{dict.roles.reception}</option>
      )}
      {roles.includes("CAPTAIN") && <option value="CAPTAIN">{dict.roles.captain}</option>}
      {roles.includes("MANAGER") && <option value="MANAGER">{dict.roles.manager}</option>}
    </Select>
  );
}

function VideoPermissionField({ dict, defaultChecked }: { dict: Dictionary; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border p-3">
      <input
        type="checkbox"
        name="canAddVideos"
        defaultChecked={defaultChecked}
        className="size-4 accent-brand"
      />
      <span className="text-sm">
        <span className="font-medium">{dict.manager.canAddVideos}</span>
        <span className="block text-xs text-muted-foreground">{dict.manager.canAddVideosDesc}</span>
      </span>
    </label>
  );
}

/**
 * Which parts of the system a new manager starts with.
 *
 * Decided here rather than left for afterwards: a manager created with
 * nothing is a manager who signs in to a blank screen and has to be found
 * and fixed. Reception and captains never see this — their remit comes with
 * the job, and there is nothing to choose.
 */
function SectionsField({
  dict,
  defaultSections,
}: {
  dict: Dictionary;
  /** Ticked from the start when editing an existing manager's access. */
  defaultSections?: Section[];
}) {
  const t = dict.manager;
  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t.sectionsLabel}</legend>
      <p className="text-xs text-muted-foreground">{t.sectionsHelp}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <label
            key={section}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
          >
            <input
              type="checkbox"
              name="sections"
              value={section}
              defaultChecked={defaultSections?.includes(section)}
              className="size-4 accent-[var(--brand)]"
            />
            {dict.sections[section.toLowerCase() as "reception"]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function useAccountFeedback(state: ActionState, dict: Dictionary, onDone: () => void) {
  useEffect(() => {
    if (state.ok) {
      toast.success(dict.manager.accountSaved);
      onDone();
    } else if (state.error) {
      toast.error(accountError(state.error, dict));
    }
  }, [state, onDone, dict]);
}

function CreateForm({
  dict,
  onDone,
  assignableRoles,
}: {
  dict: Dictionary;
  onDone: () => void;
  assignableRoles: Role[];
}) {
  const t = dict.manager;
  const [state, action, pending] = useActionState(createAccount, emptyState);
  const [role, setRole] = useState<Role | "">("");
  useAccountFeedback(state, dict, onDone);
  const err = fieldErrors(state, dict);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">{t.displayName}</Label>
        <Input id="displayName" name="displayName" required minLength={2} maxLength={60} autoFocus />
        <FieldError message={err("displayName")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username">{dict.auth.username}</Label>
          {/* The pattern gives the browser a chance to say no before the
              round trip; the server enforces the same rule regardless. */}
          <Input
            id="username"
            name="username"
            dir="ltr"
            required
            minLength={3}
            maxLength={40}
            pattern="[A-Za-z0-9_.\-]+"
            autoComplete="off"
            className="text-start"
          />
          <p className="text-xs text-muted-foreground">{t.usernameRule}</p>
          <FieldError message={err("username")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{dict.auth.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            maxLength={100}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">{t.passwordRule}</p>
          <FieldError message={err("password")} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">{t.role}</Label>
        <RoleSelect
          value={role}
          onChange={setRole}
          dict={dict}
          required
          roles={assignableRoles}
        />
      </div>
      {role === "CAPTAIN" && <VideoPermissionField dict={dict} />}
      {role === "MANAGER" && <SectionsField dict={dict} />}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? dict.common.saving : t.create}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  account,
  dict,
  onDone,
  assignableRoles,
}: {
  account: AccountRow;
  dict: Dictionary;
  onDone: () => void;
  assignableRoles: Role[];
}) {
  const t = dict.manager;
  const [state, action, pending] = useActionState(updateAccount, emptyState);
  const [role, setRole] = useState<Role>(account.role);
  useAccountFeedback(state, dict, onDone);
  const err = fieldErrors(state, dict);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={account.id} />
      <div className="space-y-2">
        <Label htmlFor="displayName">{t.displayName}</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={account.displayName}
          required
          minLength={2}
          maxLength={60}
        />
        <FieldError message={err("displayName")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">{t.role}</Label>
        <RoleSelect
          value={role}
          onChange={setRole}
          dict={dict}
          // The account's own role stays on the list even when this person
          // could not create one, so editing a name never silently demotes.
          roles={
            assignableRoles.includes(account.role)
              ? assignableRoles
              : [...assignableRoles, account.role]
          }
        />
        {account.isSelf && <p className="text-xs text-muted-foreground">{t.selfLockout}</p>}
      </div>
      <label className="flex items-center gap-3 rounded-lg border border-border p-3">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={account.isActive}
          disabled={account.isSelf}
          className="size-4 accent-brand"
        />
        <span className="text-sm font-medium">{t.activeAccount}</span>
      </label>
      {role === "CAPTAIN" && <VideoPermissionField dict={dict} defaultChecked={account.canAddVideos} />}
      {role === "MANAGER" && <SectionsField dict={dict} defaultSections={account.sections} />}
      <div className="flex justify-end gap-2 pt-1">
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

function ResetForm({
  account,
  dict,
  onDone,
}: {
  account: AccountRow;
  dict: Dictionary;
  onDone: () => void;
}) {
  const t = dict.manager;
  const [state, action, pending] = useActionState(resetPassword, emptyState);
  useAccountFeedback(state, dict, onDone);
  const err = fieldErrors(state, dict);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={account.id} />
      <p className="rounded-lg bg-muted/50 p-3 text-sm font-medium">{account.displayName}</p>
      <div className="space-y-2">
        <Label htmlFor="password">{t.newPassword}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          maxLength={100}
          autoComplete="new-password"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{t.passwordRule}</p>
        <FieldError message={err("password")} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
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
