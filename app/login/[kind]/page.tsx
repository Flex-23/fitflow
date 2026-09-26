import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Role } from "@prisma/client";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { login, pickLogin } from "@/app/actions/auth";
import { LoginShell } from "@/components/auth/login-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

/** Each door and the one role it admits. */
const DOORS: Record<string, Role> = {
  reception: "RECEPTION",
  captain: "CAPTAIN",
  manager: "MANAGER",
};

/**
 * One sign-in door per kind of staff.
 *
 * Reception and captains pick their name from the accounts of their own role
 * and type a password; a manager types a username and password. Each door
 * admits only its own role, and five wrong passwords lock that account — not
 * the device — for a quarter of an hour.
 */
export default async function LoginDoorPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { kind } = await params;
  const role = DOORS[kind];
  if (!role) notFound();

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.auth;
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;

  const title =
    role === "RECEPTION" ? t.doorReception : role === "CAPTAIN" ? t.doorCaptain : t.doorManager;

  // Names only, never usernames: the list is shown before anyone signs in.
  const accounts =
    role === "MANAGER"
      ? null
      : await prisma.user.findMany({
          where: { role, isActive: true, deletedAt: null },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        });

  const labels = {
    username: t.username,
    password: t.password,
    usernamePlaceholder: t.usernamePlaceholder,
    passwordPlaceholder: t.passwordPlaceholder,
    signIn: t.signIn,
    signingIn: t.signingIn,
    invalidCredentials: accounts ? t.wrongPassword : t.invalidCredentials,
    accountDisabled: t.accountDisabled,
    tooManyAttempts: t.tooManyAttempts,
    attemptsLeft: t.attemptsLeft,
    account: t.account,
    chooseAccount: t.chooseAccount,
  };

  return (
    <LoginShell locale={locale} title={title} subtitle={t.signInSubtitle}>
      {accounts && accounts.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t.noAccounts}</p>
      ) : accounts ? (
        <LoginForm
          signIn={pickLogin}
          next={safeNext}
          labels={labels}
          hidden={{ kind: role }}
          accounts={accounts.map((a) => ({ id: a.id, name: a.displayName }))}
        />
      ) : (
        <LoginForm signIn={login} next={safeNext} labels={labels} />
      )}

      <Link
        href={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login"}
        className="mt-5 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <Back className="size-4" />
        {t.back}
      </Link>
    </LoginShell>
  );
}
