"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  UserPlus,
  Tags,
  BadgeCheck,
  CalendarX2,
  Wallet,
  Users,
  Dumbbell,
  Salad,
  Video,
  ShieldCheck,
  ScrollText,
  LineChart,
  Receipt,
  HandCoins,
  Archive,
  Bell,
  Settings,
  DatabaseBackup,
  DoorOpen,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandWatermark } from "@/components/brand-watermark";
import { MyAccount } from "@/components/layout/my-account";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };
type NavGroup = { heading?: string; items: NavItem[] };

export type ShellUser = {
  displayName: string;
  role: Role;
  canAddVideos: boolean;
};

export function AppShell({
  user,
  dict,
  locale,
  notificationCount = 0,
  children,
}: {
  user: ShellUser;
  dict: Dictionary;
  locale: Locale;
  notificationCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const n = dict.nav;

  const isManager = user.role === "MANAGER";
  const isReception = user.role === "RECEPTION";
  const isCaptain = user.role === "CAPTAIN";
  const canReception = isManager || isReception;
  const canCoach = isManager || isCaptain;
  const canVideos = isManager || (isCaptain && user.canAddVideos);

  const groups: NavGroup[] = [
    canReception && {
      heading: n.reception,
      items: [
        { href: "/registration", label: n.registration, icon: UserPlus },
        { href: "/active", label: n.active, icon: BadgeCheck },
        { href: "/expired", label: n.expired, icon: CalendarX2 },
        { href: "/deferred", label: n.deferred, icon: Wallet },
        { href: "/members", label: n.members, icon: Users },
        { href: "/gate", label: n.gate, icon: DoorOpen },
      ],
    },
    canCoach && {
      heading: n.coaching,
      items: [
        { href: "/training", label: n.training, icon: Dumbbell },
        { href: "/nutrition", label: n.nutrition, icon: Salad },
      ],
    },
    canVideos && {
      heading: n.library,
      items: [{ href: "/videos", label: n.videos, icon: Video }],
    },
    isManager && {
      heading: n.finance,
      items: [
        { href: "/reports", label: n.reports, icon: LineChart },
        { href: "/expenses", label: n.expenses, icon: Receipt },
        { href: "/debts", label: n.debts, icon: HandCoins },
        // Plans are a pricing decision — manager only.
        { href: "/plans", label: n.plans, icon: Tags },
      ],
    },
    isManager && {
      heading: n.management,
      items: [
        { href: "/archive", label: n.archive, icon: Archive },
        { href: "/captains", label: n.staff, icon: ShieldCheck },
        { href: "/activity", label: n.activityLog, icon: ScrollText },
        {
          href: "/notifications",
          label: n.notifications,
          icon: Bell,
          badge: notificationCount,
        },
        { href: "/settings", label: n.settings, icon: Settings },
        { href: "/backup", label: n.backup, icon: DatabaseBackup },
      ],
    },
  ].filter(Boolean) as NavGroup[];

  const roleKey = user.role.toLowerCase() as "manager" | "reception" | "captain";
  const roleLabel = dict.roles[roleKey];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-sidebar-border bg-sidebar lg:flex">
        <div className="p-5">
          <Brand />
        </div>
        <NavList groups={groups} />
        <UserFooter displayName={user.displayName} roleLabel={roleLabel} signOut={dict.auth.signOut} dict={dict} />
      </aside>

      {/* Content column */}
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="grid size-10 place-items-center rounded-lg hover:bg-accent lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="lg:hidden">
              <Brand size="sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher current={locale} />
          </div>
        </header>

        {/* Behind the working area only — never under the sidebar or the
            header, which have solid backgrounds of their own. Kept very faint
            because tables and figures sit on top of it all day, and a
            watermark that costs anyone a squint is not worth having. */}
        <BrandWatermark intensity={7} />

        <main className="relative z-10 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-[fade-in_.15s_ease-out] bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] animate-[fade-in_.2s_ease-out] flex-col border-e border-sidebar-border bg-sidebar shadow-2xl">
            <div className="flex items-center justify-between p-5">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-lg hover:bg-accent"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
            <UserFooter displayName={user.displayName} roleLabel={roleLabel} signOut={dict.auth.signOut} dict={dict} />
          </div>
        </div>
      )}
    </div>
  );
}

function NavList({
  groups,
  onNavigate,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="scroll-quiet flex-1 space-y-6 overflow-y-auto px-3 py-2">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-1">
          {group.heading && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.heading}
            </p>
          )}
          {group.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserFooter({
  displayName,
  roleLabel,
  signOut,
  dict,
}: {
  displayName: string;
  roleLabel: string;
  signOut: string;
  dict: Dictionary;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-primary/15 text-sm font-bold text-sidebar-primary">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <Badge variant="muted" className="mt-0.5">
            {roleLabel}
          </Badge>
        </div>
      </div>
      <MyAccount dict={dict} displayName={displayName} />
      <form action={logout}>
        <button
          type="submit"
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4" />
          {signOut}
        </button>
      </form>
    </div>
  );
}
