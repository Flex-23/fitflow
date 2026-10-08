import type { PrismaClient } from "@prisma/client";
import type { C3Panel, FieldSpec } from "./c3";

/**
 * Keeping the panel's own memory in sync with FitFlow — docs/gate-hybrid-mode.md §4.
 *
 * The panel is a cache: FitFlow computes who should be able to open the door
 * right now, reads what the panel currently believes, and reconciles the two.
 * A diff-based reconcile (rather than streaming individual changes) is what
 * self-heals a panel that lost power, was reset, or missed an update while
 * the bridge was down — the next reconcile just rebuilds it from the DB.
 *
 * No server-only import: scripts/gate-bridge.ts runs this outside Next.js.
 */

/** One member's desired row on the panel. The card number doubles as CardNo
 *  and Pin (see docs/gate-hybrid-mode.md §4.1 — reusing it avoids a numeric
 *  id on Member). Dates are `YYYYMMDD` integers, as the panel wants them. */
export type DesiredCard = {
  memberId: string;
  card: number;
  startDate: number;
  endDate: number;
};

const ymd = (d: Date): number => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/**
 * Everyone who should be able to open the door right now: a card on file,
 * and at least one ACTIVE subscription whose period covers today or starts
 * later (an early-renewal chain). When more than one qualifies, the panel
 * gets the earliest start and the latest end, so it never denies a day the
 * gym has been paid for.
 */
export async function desiredPanelState(prisma: PrismaClient, now: Date = new Date()): Promise<DesiredCard[]> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const members = await prisma.member.findMany({
    where: {
      cardWiegand: { not: null },
      subscriptions: { some: { status: "ACTIVE", endDate: { gte: startOfToday } } },
    },
    select: {
      id: true,
      cardWiegand: true,
      subscriptions: {
        where: { status: "ACTIVE", endDate: { gte: startOfToday } },
        select: { startDate: true, endDate: true },
      },
    },
  });

  return members.map((m) => {
    const starts = m.subscriptions.map((s) => s.startDate.getTime());
    const ends = m.subscriptions.map((s) => s.endDate.getTime());
    return {
      memberId: m.id,
      card: m.cardWiegand!,
      startDate: ymd(new Date(Math.min(...starts))),
      endDate: ymd(new Date(Math.max(...ends))),
    };
  });
}

/** Every card FitFlow has ever heard of, qualifying or not — the line
 *  between "remove" (a member who no longer qualifies) and "foreign" (a row
 *  the panel has that FitFlow never put there). */
export async function knownCards(prisma: PrismaClient): Promise<Set<number>> {
  const rows = await prisma.member.findMany({
    where: { cardWiegand: { not: null } },
    select: { cardWiegand: true },
  });
  return new Set(rows.map((r) => r.cardWiegand!));
}

/**
 * Delete every row the panel currently holds, in both tables. Used by the
 * manager's "تفريغ ذاكرة اللوحة" button — a full reconcile right after this
 * rebuilds the panel clean, which also clears out any corrupted or
 * duplicated rows a `SETDATA` quirk might have left behind.
 */
export async function wipePanel(panel: C3Panel): Promise<number> {
  const config = await panel.getTableConfig();
  const userTable = config.user;
  const authTable = config.userauthorize;
  if (!userTable || !authTable) {
    throw new Error("panel did not report user/userauthorize tables — check DATATABLE_CFG output");
  }
  const cardNoField = userTable.fields.CardNo;
  const pinField = authTable.fields.Pin;
  if (!cardNoField || !pinField) {
    throw new Error("panel's user/userauthorize tables are missing CardNo/Pin");
  }
  const rows = await panel.getData(userTable.index, [cardNoField]);
  for (const row of rows) {
    const card = Number(row.CardNo);
    if (!Number.isFinite(card) || card <= 0) continue;
    await panel.deleteData(userTable.index, { ...cardNoField, value: card });
    await panel.deleteData(authTable.index, { ...pinField, value: card });
  }
  return rows.length;
}

export type ReconcileCounts = { added: number; updated: number; removed: number; foreign: number };

export type ReconcileOptions = {
  /** From GATE_DOOR — which entry door(s) this reconcile authorizes. */
  door: number;
  /** From GATE_TIMEZONE_ID — the panel's factory time zone for "always open". */
  timezoneId: number;
  /** From GATE_PANEL_TAKEOVER — delete rows the panel has that FitFlow does
   *  not recognize at all. False just reports them. */
  takeover: boolean;
  /** Called once per foreign card found, only when `takeover` is false. */
  onForeign?: (card: number) => void;
};

const REQUIRED_USER_FIELDS = ["CardNo", "Pin", "Password", "Group", "StartTime", "EndTime", "SuperAuthorize"];
const REQUIRED_AUTH_FIELDS = ["Pin", "AuthorizeTimezoneId", "AuthorizeDoorId"];

/** Rebuild the panel's `user`/`userauthorize` tables to match the database. */
export async function reconcile(
  panel: C3Panel,
  prisma: PrismaClient,
  opts: ReconcileOptions
): Promise<ReconcileCounts> {
  const config = await panel.getTableConfig();
  const userTable = config.user;
  const authTable = config.userauthorize;
  if (!userTable || !authTable) {
    throw new Error("panel did not report user/userauthorize tables — check DATATABLE_CFG output");
  }
  const userField = (name: string): FieldSpec => {
    const f = userTable.fields[name];
    if (!f) throw new Error(`panel's "user" table has no "${name}" field`);
    return f;
  };
  const authField = (name: string): FieldSpec => {
    const f = authTable.fields[name];
    if (!f) throw new Error(`panel's "userauthorize" table has no "${name}" field`);
    return f;
  };
  for (const name of REQUIRED_USER_FIELDS) userField(name);
  for (const name of REQUIRED_AUTH_FIELDS) authField(name);

  const [actualUsers, desired, known] = await Promise.all([
    panel.getData(userTable.index, [userField("CardNo"), userField("StartTime"), userField("EndTime")]),
    desiredPanelState(prisma),
    knownCards(prisma),
  ]);

  const actualByCard = new Map<number, { startDate: number; endDate: number }>();
  for (const row of actualUsers) {
    const card = Number(row.CardNo);
    if (Number.isFinite(card) && card > 0) {
      actualByCard.set(card, { startDate: Number(row.StartTime), endDate: Number(row.EndTime) });
    }
  }

  const doorBitmask = 1 << (opts.door - 1);
  const counts: ReconcileCounts = { added: 0, updated: 0, removed: 0, foreign: 0 };
  const desiredCards = new Set(desired.map((d) => d.card));

  const upsert = async (d: DesiredCard) => {
    await panel.setData(userTable.index, [
      { ...userField("CardNo"), value: d.card },
      { ...userField("Pin"), value: d.card },
      { ...userField("Password"), value: "" },
      { ...userField("Group"), value: 0 },
      { ...userField("StartTime"), value: d.startDate },
      { ...userField("EndTime"), value: d.endDate },
      { ...userField("SuperAuthorize"), value: 0 },
    ]);
    await panel.setData(authTable.index, [
      { ...authField("Pin"), value: d.card },
      { ...authField("AuthorizeTimezoneId"), value: opts.timezoneId },
      { ...authField("AuthorizeDoorId"), value: doorBitmask },
    ]);
  };

  for (const d of desired) {
    const a = actualByCard.get(d.card);
    if (!a) {
      await upsert(d);
      counts.added++;
    } else if (a.startDate !== d.startDate || a.endDate !== d.endDate) {
      await upsert(d);
      counts.updated++;
    }
  }

  for (const [card] of actualByCard) {
    if (desiredCards.has(card)) continue;
    if (known.has(card)) {
      // A member who no longer qualifies (frozen, cancelled, expired, card
      // cleared) — remove from both tables.
      await panel.deleteData(userTable.index, { ...userField("CardNo"), value: card });
      await panel.deleteData(authTable.index, { ...authField("Pin"), value: card });
      counts.removed++;
    } else {
      // A row FitFlow never put there (a leftover install, or a foreign
      // card) — never touched without an explicit takeover.
      counts.foreign++;
      opts.onForeign?.(card);
      if (opts.takeover) {
        await panel.deleteData(userTable.index, { ...userField("CardNo"), value: card });
        await panel.deleteData(authTable.index, { ...authField("Pin"), value: card });
      }
    }
  }

  return counts;
}
