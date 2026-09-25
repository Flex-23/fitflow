"use client";

import { useActionState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { login, type LoginState } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

export function LoginForm({
  labels,
  next,
  signIn = login,
  hidden,
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
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signIn,
    {}
  );

  const locked = state?.error === "locked";
  const errorMessage = locked
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
