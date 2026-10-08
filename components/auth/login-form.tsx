"use client";

import { useActionState, useState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { login, type LoginState } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type LoginLabels = {
  username: string;
  password: string;
  usernamePlaceholder: string;
  passwordPlaceholder: string;
  signIn: string;
  signingIn: string;
  invalidCredentials: string;
  accountDisabled: string;
  tooManyAttempts: string;
  attemptsLeft: string;
  /** Only used when the form picks from `accounts`. */
  account?: string;
  chooseAccount?: string;
};

export function LoginForm({
  labels,
  next,
  signIn = login,
  hidden,
  accounts,
}: {
  labels: LoginLabels;
  /** Where to land after signing in, when the user was bounced from a page. */
  next?: string;
  /**
   * Which door this form opens. The master has one of its own, which accepts
   * only master accounts — the ordinary form refuses them, so knowing the
   * password is no use without knowing where to type it.
   */
  signIn?: (prev: LoginState, formData: FormData) => Promise<LoginState>;
  /** Extra fields carried with the submission, such as the master gate. */
  hidden?: Record<string, string>;
  /**
   * When given, the person picks their name from this list instead of typing
   * a username, and the form submits the account's id.
   */
  accounts?: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signIn,
    {}
  );
  const [picked, setPicked] = useState("");
  // Until someone picks, the list shows the account the last answer was
  // about, so a failed attempt comes back with that name still chosen.
  const current = picked || state?.forUser || "";

  // On the pick-your-name doors an answer is about one account. Picking a
  // different one hides it — its lock is that account's, not this one's —
  // and picking the locked account again brings it back.
  const aboutThis = !accounts || !state?.forUser || state.forUser === current;

  const locked = aboutThis && state?.error === "locked";
  const errorMessage = !aboutThis
    ? null
    : locked
      ? labels.tooManyAttempts.replace("{n}", String(state.lockedMinutes ?? 15))
      : state?.error === "disabled"
        ? labels.accountDisabled
        : state?.error
          ? labels.invalidCredentials
          : null;

  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {errorMessage && (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          {!locked && state?.attemptsLeft != null && state.attemptsLeft > 0 && (
            <p className="ps-6 text-xs opacity-80">
              {labels.attemptsLeft.replace("{n}", String(state.attemptsLeft))}
            </p>
          )}
        </div>
      )}

      {accounts ? (
        <div className="space-y-2">
          <Label htmlFor="userId">{labels.account}</Label>
          <Select
            id="userId"
            name="userId"
            required
            value={current}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="" disabled>
              {labels.chooseAccount}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="username">{labels.username}</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            placeholder={labels.usernamePlaceholder}
            required
            autoFocus
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder={labels.passwordPlaceholder}
          required
        />
      </div>

      <Button
        type="submit"
        variant="brand"
        size="lg"
        className="w-full"
        disabled={pending || locked}
      >
        <LogIn className="size-4" />
        {pending ? labels.signingIn : labels.signIn}
      </Button>
    </form>
  );
}
