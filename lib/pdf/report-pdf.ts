import "server-only";
import type { Report, Movement } from "@/lib/reports";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import {
  Builder,
  header,
  rule,
  sectionBar,
  shapeForPdf,
  PAGE,
  MARGIN,
  INK,
  MUTED,
  RULE,
  GREEN,
  RED,
} from "./course-pdf";

export type ReportPdfInput = {
  mode: "daily" | "monthly";
  report: Report;
  previous: Report;
  outstanding: { deferred: number; debts: number };
  /** Individual movements — daily reports list them all. */
  movements: Movement[];
  dict: Dictionary;
  locale: Locale;
};

/** A printable version of the finance report, matching the on-screen figures. */
export async function buildReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const { mode, report, previous, outstanding, movements, dict, locale } = input;
  const t = dict.finance;
  const rtl = locale === "ar";
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const b = await Builder.create(rtl);

  const period =
    mode === "daily"
      ? formatDate(report.from, locale)
      : `${formatDate(report.from, locale)} → ${formatDate(report.to, locale)}`;
  header(b, `${t.reportsTitle} — ${mode === "daily" ? t.daily : t.monthly}`, period);

  // ── Headline ──
  const outcome = !report.hasMovement
    ? t.noNet
    : report.net > 0
      ? t.netProfit
      : report.net < 0
        ? t.netLoss
        : t.breakEven;
  const netColor = report.net > 0 ? GREEN : report.net < 0 ? RED : MUTED;
  b.text(outcome, { size: 12, color: MUTED });
  b.y -= 22;
  b.text(`${report.net > 0 ? "+" : report.net < 0 ? "−" : ""} ${money(Math.abs(report.net))}`, {
    size: 22,
    color: netColor,
  });
  b.y -= 14;
  if (report.margin !== null) {
    b.text(
      `${report.net >= 0 ? t.profitMargin : t.lossRatio}: ${Math.abs(Math.round(report.margin))}%`,
      { size: 10, color: MUTED }
    );
    b.y -= 14;
  }
  b.y -= 4;
  rule(b);

  // ── Totals table ──
  sectionBar(b, t.income);
  kv(b, t.subscriptionIncome, money(report.subscriptionIncome), GREEN);
  kv(b, t.debtIncome, money(report.debtIncome), GREEN);
  kv(b, t.totalIncome, money(report.totalIncome), GREEN, true);
  kv(b, t.newMembers, String(report.newMembers), INK);
  kv(b, t.newSubscriptions, String(report.newSubscriptions), INK);
  b.y -= 6;

  sectionBar(b, t.totalExpenses);
  if (report.byCategory.length === 0) {
    kv(b, "—", money(0), MUTED);
  } else {
    for (const c of report.byCategory) kv(b, t.categories[c.category], money(c.total), RED);
  }
  kv(b, t.totalExpenses, money(report.expenses), RED, true);
  b.y -= 6;

  sectionBar(b, t.prevPeriod);
  kv(b, t.totalIncome, money(previous.totalIncome), MUTED);
  kv(b, t.totalExpenses, money(previous.expenses), MUTED);
  kv(b, t.net, money(previous.net), MUTED, true);
  b.y -= 6;

  sectionBar(b, t.stillOwed);
  kv(b, t.deferredOutstanding, money(outstanding.deferred), INK);
  kv(b, t.debtsOutstanding, money(outstanding.debts), INK);
  kv(b, t.stillOwed, money(outstanding.deferred + outstanding.debts), INK, true);
  b.y -= 6;

  // ── Day by day (monthly) ──
  if (mode === "monthly") {
    sectionBar(b, t.dayByDay);
    const cols = columns(rtl, [0.34, 0.22, 0.22, 0.22]);
    tableHeader(b, cols, [t.date, t.income, t.totalExpenses, t.net]);
    const days = report.days.filter((d) => d.income > 0 || d.expenses > 0);
    if (days.length === 0) {
      b.ensure(16);
      b.text(t.noMovement, { size: 10, color: MUTED, indent: 6 });
      b.y -= 16;
    }
    for (const d of days) {
      b.ensure(16);
      cell(b, cols[0], formatDate(`${d.date}T12:00:00`, locale), INK);
      cell(b, cols[1], money(d.income), GREEN);
      cell(b, cols[2], money(d.expenses), RED);
      cell(b, cols[3], money(d.net), d.net >= 0 ? GREEN : RED);
      b.y -= 15;
    }
    b.y -= 6;
  }

  // ── Movements (daily) ──
  if (mode === "daily") {
    sectionBar(b, t.movements);
    const cols = columns(rtl, [0.12, 0.2, 0.42, 0.26]);
    tableHeader(b, cols, [t.movementTime, t.movementType, t.movementSource, dict.common.amount]);
    if (movements.length === 0) {
      b.ensure(16);
      b.text(t.noMovementsDay, { size: 10, color: MUTED, indent: 6 });
      b.y -= 16;
    }
    const label: Record<Movement["kind"], string> = {
      subscription: t.subscriptionPayment,
      debt: t.debtPayment,
      expense: t.expenseMovement,
    };
    const time = new Intl.DateTimeFormat(rtl ? "ar-IQ-u-nu-latn" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    for (const m of movements) {
      b.ensure(16);
      const out = m.kind === "expense";
      cell(b, cols[0], time.format(new Date(m.at)), MUTED);
      cell(b, cols[1], label[m.kind], INK);
      // An expense with no words of its own is named by its category.
      const name = m.label ?? (m.category ? t.categories[m.category] : "—");
      cell(b, cols[2], m.detail ? `${name} — ${m.detail}` : name, INK, 40);
      cell(b, cols[3], `${out ? "−" : "+"} ${money(m.amount)}`, out ? RED : GREEN);
      b.y -= 15;
    }
  }

  return b.bytes();
}

/* ───────────────────────── helpers ───────────────────────── */

/** Label on the reading side, value on the other, optional emphasis line. */
function kv(b: Builder, label: string, value: string, color = INK, strong = false) {
  b.ensure(18);
  b.text(label, { size: strong ? 11 : 10, color: strong ? INK : MUTED, indent: 6 });
  b.text(value, { size: strong ? 11 : 10, color, align: "end", indent: 6 });
  if (strong) {
    b.page.drawLine({
      start: { x: MARGIN, y: b.y - 5 },
      end: { x: PAGE.w - MARGIN, y: b.y - 5 },
      thickness: 0.5,
      color: RULE,
    });
  }
  b.y -= 17;
}

type Col = { x: number; w: number };

/** Column x-positions across the content width, in reading order. */
function columns(rtl: boolean, fractions: number[]): Col[] {
  const width = PAGE.w - MARGIN * 2;
  const cols: Col[] = [];
  let cursor = rtl ? PAGE.w - MARGIN : MARGIN;
  for (const f of fractions) {
    const w = width * f;
    cols.push(rtl ? { x: cursor - w, w } : { x: cursor, w });
    cursor = rtl ? cursor - w : cursor + w;
  }
  return cols;
}

function tableHeader(b: Builder, cols: Col[], labels: string[]) {
  b.ensure(20);
  labels.forEach((l, i) => cell(b, cols[i], l, MUTED));
  b.y -= 4;
  b.page.drawLine({
    start: { x: MARGIN, y: b.y - 4 },
    end: { x: PAGE.w - MARGIN, y: b.y - 4 },
    thickness: 0.6,
    color: RULE,
  });
  b.y -= 14;
}

/** Text inside a column, aligned to the reading start, clipped to fit. */
function cell(b: Builder, col: Col, raw: string, color = INK, maxChars = 24) {
  const text = raw.length > maxChars ? raw.slice(0, maxChars - 1) + "…" : raw;
  const shaped = shapeForPdf(text);
  const w = b.widthOf(shaped, 9.5);
  const x = b.rtl ? col.x + col.w - w - 4 : col.x + 4;
  b.textAt(text, x, { size: 9.5, color });
}
