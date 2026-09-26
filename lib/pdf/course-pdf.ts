import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  PDFName,
  PDFString,
  rgb,
  type Color,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { shapeForPdf } from "./arabic";
export { shapeForPdf };

export const PAGE = { w: 595.28, h: 841.89 };
export const MARGIN = 48;

export const DARK = rgb(0.11, 0.12, 0.14);
export const LIME = rgb(0.82, 0.96, 0.36);
export const INK = rgb(0.12, 0.12, 0.14);
export const MUTED = rgb(0.45, 0.45, 0.5);
export const RULE = rgb(0.88, 0.88, 0.9);
export const GREEN = rgb(0.16, 0.6, 0.35);
export const RED = rgb(0.8, 0.22, 0.2);

const fontCache = new Map<string, Uint8Array>();
function fontBytes(file: string): Uint8Array {
  let bytes = fontCache.get(file);
  if (!bytes) {
    bytes = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "lib/pdf/fonts", file)));
    fontCache.set(file, bytes);
  }
  return bytes;
}

// Reports keep Amiri; the member-facing courses use Noto Naskh Arabic — a
// cleaner, more formal Naskh. Both carry the full Arabic presentation forms
// (including the lam-alef ligatures), which the shaping here depends on.
const REPORT_FONT = "Amiri-Regular.ttf";
const COURSE_FONT = "NotoNaskhArabic-Regular.ttf";

/**
 * pdf-lib hands every string to fontkit, which detects the script and, for
 * Arabic, reverses the glyphs into visual order by itself. Our strings are
 * already reshaped and in visual order (shapeForPdf), so that second reversal
 * mirrored every line that starts with an Arabic letter. Force a script-less,
 * left-to-right layout so the glyphs stay exactly in the order we computed.
 *
 * OpenType features are switched off as well: pdf-lib only writes widths for
 * the glyphs reachable through the cmap, so a substituted variant (Amiri swaps
 * "(" for a narrower glyph, for instance) gets the PDF default width in every
 * viewer and the line comes out wider than we measured. Presentation forms
 * are already the final glyphs, so nothing is lost.
 */
const NO_FEATURES = Object.fromEntries(
  [
    "rvrn", "ltra", "ltrm", "rtla", "rtlm", "frac", "numr", "dnom", "rand", "trak", "opbd",
    "ccmp", "locl", "rlig", "mark", "mkmk", "calt", "clig", "liga", "rclt", "curs", "kern",
    "dist", "vert", "vrt2", "init", "medi", "fina", "isol",
  ].map((tag) => [tag, false])
);

const visualOrderFontkit = {
  create(buffer: Parameters<typeof fontkit.create>[0]) {
    const font = fontkit.create(buffer);
    // pdf-lib's typing stops at (text, features); the runtime signature is
    // layout(text, features, script, language, direction).
    const layout = font.layout.bind(font) as (
      text: string,
      features?: Record<string, boolean>,
      script?: string,
      language?: string,
      direction?: "ltr" | "rtl"
    ) => ReturnType<typeof font.layout>;
    font.layout = (text) => layout(text, NO_FEATURES, "latn", undefined, "ltr");
    return font;
  },
};

export type Align = "start" | "end" | "center";

export class Builder {
  doc!: PDFDocument;
  font!: PDFFont;
  page!: PDFPage;
  y = 0;
  rtl = false;

  static async create(rtl: boolean, fontFile: string = REPORT_FONT) {
    const b = new Builder();
    b.doc = await PDFDocument.create();
    b.doc.registerFontkit(visualOrderFontkit);
    // Never subset: fontkit's subsetter drops the components of composite
    // glyphs, leaving most letters blank in every viewer. The full font adds
    // a couple hundred KB, which WhatsApp handles fine.
    b.font = await b.doc.embedFont(fontBytes(fontFile), { subset: false });
    b.rtl = rtl;
    b.addPage();
    return b;
  }

  addPage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - MARGIN;
  }

  ensure(space: number) {
    if (this.y - space < MARGIN) this.addPage();
  }

  widthOf(shaped: string, size: number) {
    return this.font.widthOfTextAtSize(shaped, size);
  }

  /** Draw text at an explicit x (used by tables), no alignment logic. */
  textAt(raw: string, x: number, opts: { size?: number; color?: Color } = {}) {
    const shaped = shapeForPdf(raw);
    this.page.drawText(shaped, {
      x,
      y: this.y,
      size: opts.size ?? 10,
      font: this.font,
      color: opts.color ?? INK,
    });
  }

  private xFor(shaped: string, size: number, align: Align, indent: number) {
    const w = this.widthOf(shaped, size);
    if (align === "center") return (PAGE.w - w) / 2;
    const startRight = this.rtl;
    const atStart = align === "start";
    const right = atStart ? startRight : !startRight;
    return right ? PAGE.w - MARGIN - indent - w : MARGIN + indent;
  }

  text(
    raw: string,
    opts: {
      size?: number;
      color?: Color;
      align?: Align;
      indent?: number;
    } = {}
  ) {
    const size = opts.size ?? 11;
    const align = opts.align ?? "start";
    const indent = opts.indent ?? 0;
    const shaped = shapeForPdf(raw);
    const x = this.xFor(shaped, size, align, indent);
    this.page.drawText(shaped, {
      x,
      y: this.y,
      size,
      font: this.font,
      color: opts.color ?? INK,
    });
  }

  /** A tappable area on the current page; nothing is drawn. */
  addLink(x: number, y: number, w: number, h: number, url: string) {
    const annot = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    const ref = this.doc.context.register(annot);
    let annots = this.page.node.Annots();
    if (!annots) {
      annots = this.doc.context.obj([]);
      this.page.node.set(PDFName.of("Annots"), annots);
    }
    annots.push(ref);
  }

  bytes() {
    return this.doc.save();
  }
}

export function header(b: Builder, title: string, subtitle?: string) {
  const barH = 72;
  b.page.drawRectangle({
    x: 0,
    y: PAGE.h - barH,
    width: PAGE.w,
    height: barH,
    color: DARK,
  });
  const mark = "FitFlow";
  const size = 22;
  const w = b.font.widthOfTextAtSize(mark, size);
  b.page.drawText(mark, {
    x: b.rtl ? PAGE.w - MARGIN - w : MARGIN,
    y: PAGE.h - 46,
    size,
    font: b.font,
    color: LIME,
  });
  b.y = PAGE.h - barH - 30;
  b.text(title, { size: 18 });
  b.y -= 22;
  if (subtitle) {
    b.text(subtitle, { size: 11, color: MUTED });
    b.y -= 18;
  }
  b.y -= 6;
}

export function rule(b: Builder) {
  b.page.drawLine({
    start: { x: MARGIN, y: b.y },
    end: { x: PAGE.w - MARGIN, y: b.y },
    thickness: 0.8,
    color: RULE,
  });
  b.y -= 16;
}

export function sectionBar(b: Builder, label: string) {
  b.ensure(40);
  const h = 26;
  b.page.drawRectangle({
    x: MARGIN,
    y: b.y - h + 8,
    width: PAGE.w - MARGIN * 2,
    height: h,
    color: rgb(0.95, 0.96, 0.92),
  });
  const prevY = b.y;
  b.y = prevY - 10;
  b.text(label, { size: 13, indent: 10, color: rgb(0.2, 0.3, 0.05) });
  b.y = prevY - h - 6;
}


// ───────────────────────── Course layout ─────────────────────────
//
// Courses are what a member keeps on their phone, so they wear the app's own
// look rather than the office one the reports use: a dark page, white text,
// the logo faintly behind everything, and one day to a page so "today" is a
// single swipe away.

const BG = rgb(0.07, 0.075, 0.09);
const CARD = rgb(0.125, 0.135, 0.16);
const WHITE = rgb(1, 1, 1);
const SOFT = rgb(0.68, 0.7, 0.75);
const LINE = rgb(0.22, 0.235, 0.27);

const CM = 40;
const CW = PAGE.w - CM * 2;
const BODY = 12.5;
const LINE_H = 19;
const CELL_PAD = 8;
const INSET = 8;
/** Room taken by the small play mark in front of a name that has a video. */
const MARK_W = 12;

let watermarkCache: Uint8Array | null = null;
function watermarkBytes(): Uint8Array {
  if (!watermarkCache) {
    // The site's logo with its black backdrop turned transparent, so it can
    // sit behind the text without a visible rectangle.
    watermarkCache = new Uint8Array(
      fs.readFileSync(path.join(process.cwd(), "lib/pdf/watermark.png"))
    );
  }
  return watermarkCache;
}

type Span = { x: number; w: number };
const FULL: Span = { x: CM, w: CW };

class DarkCourse {
  private constructor(
    readonly b: Builder,
    private mark: PDFImage,
    private footer: string | null
  ) {}

  static async create(rtl: boolean, footer: string | null = null) {
    const b = await Builder.create(rtl, COURSE_FONT);
    const c = new DarkCourse(b, await b.doc.embedPng(watermarkBytes()), footer);
    c.paint();
    return c;
  }

  get rtl() {
    return this.b.rtl;
  }

  get y() {
    return this.b.y;
  }

  set y(v: number) {
    this.b.y = v;
  }

  newPage() {
    this.b.addPage();
    this.paint();
  }

  private paint() {
    const page = this.b.page;
    page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: BG });
    const w = PAGE.w * 0.86;
    const h = w * (this.mark.height / this.mark.width);
    page.drawImage(this.mark, {
      x: (PAGE.w - w) / 2,
      y: (PAGE.h - h) / 2 - 60,
      width: w,
      height: h,
      opacity: 0.09,
    });
    // Who wrote the course, at the foot of every page, physically on the left
    // in both directions (the end edge in Arabic, the start edge in English).
    if (this.footer) {
      this.draw(this.footer, FULL, 26, {
        size: 9,
        color: SOFT,
        align: this.rtl ? "end" : "start",
      });
    }
    this.b.y = PAGE.h - CM;
  }

  width(raw: string, size: number) {
    return this.b.widthOf(shapeForPdf(raw), size);
  }

  /** Draw raw text inside a span — against its start or end edge, or centred. */
  draw(
    raw: string,
    span: Span,
    y: number,
    opts: { size: number; color: Color; align?: Align; inset?: number }
  ) {
    const shaped = shapeForPdf(raw);
    const w = this.b.widthOf(shaped, opts.size);
    const inset = opts.inset ?? 0;
    const align = opts.align ?? "start";
    let x: number;
    if (align === "center") {
      x = span.x + (span.w - w) / 2;
    } else {
      const right = (align === "start") === this.rtl;
      x = right ? span.x + span.w - inset - w : span.x + inset;
    }
    this.b.page.drawText(shaped, { x, y, size: opts.size, font: this.b.font, color: opts.color });
    return { x, w };
  }

  /** Break a logical string into lines no wider than maxW. */
  wrap(raw: string, size: number, maxW: number): string[] {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = words[0];
    for (const word of words.slice(1)) {
      const next = `${line} ${word}`;
      if (this.width(next, size) <= maxW) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
    return lines;
  }

  hline(y: number, span: Span = FULL) {
    this.b.page.drawLine({
      start: { x: span.x, y },
      end: { x: span.x + span.w, y },
      thickness: 0.6,
      color: LINE,
    });
  }

  vline(x: number, top: number, bottom: number) {
    this.b.page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      thickness: 0.6,
      color: LINE,
    });
  }
}

/** One fact about the member, shown in the card at the top of each page. */
type CardItem = { label?: string; value: string; strong?: boolean };

/**
 * The card at the top of every page: the day heading, then the member's
 * details beneath it, inside one box. There is no separate brand line — the
 * watermark carries the logo, and the day is the heading now.
 */
function pageTop(c: DarkCourse, dayLabel: string, items: CardItem[] | null) {
  const size = 12;
  const strongSize = 14;
  const headingSize = 17;
  const gap = 20;
  const pad = 12;
  const lineH = 20;
  const headingH = 24;
  const labelGap = 4;
  const inner = CW - pad * 2;

  // Flow the member items from the start edge, wrapping onto a new line when
  // full. Empty for a template that has no member — then the card is just the
  // day heading.
  type Placed = { item: CardItem; lw: number; vw: number };
  const lines: Placed[][] = [];
  if (items?.length) {
    lines.push([]);
    let used = 0;
    for (const item of items) {
      const lw = item.label ? c.width(`${item.label}:`, size) + labelGap : 0;
      const vw = c.width(item.value, item.strong ? strongSize : size);
      let line = lines[lines.length - 1];
      if (line.length && used + gap + lw + vw > inner) {
        line = [];
        lines.push(line);
        used = 0;
      }
      used += (line.length ? gap : 0) + lw + vw;
      line.push({ item, lw, vw });
    }
  }

  const h = pad * 2 + headingH + lines.length * lineH - (lines.length ? 4 : 0);
  const top = c.y;
  c.b.page.drawRectangle({
    x: CM,
    y: top - h,
    width: CW,
    height: h,
    color: CARD,
    borderColor: LINE,
    borderWidth: 0.6,
  });

  // Day heading on the start edge (the right, in Arabic), inside the box.
  const headBase = top - pad - headingSize + 3;
  if (dayLabel) {
    c.draw(dayLabel, { x: CM + pad, w: CW - pad * 2 }, headBase, {
      size: headingSize,
      color: LIME,
      align: "start",
    });
  }

  let base = top - pad - headingH - 6;
  for (const line of lines) {
    let offset = pad;
    for (const { item, lw, vw } of line) {
      const w = lw + vw;
      const span: Span = c.rtl ? { x: CM + CW - offset - w, w } : { x: CM + offset, w };
      if (item.label) c.draw(`${item.label}:`, span, base, { size, color: SOFT, align: "start" });
      c.draw(item.value, span, base, {
        size: item.strong ? strongSize : size,
        color: WHITE,
        align: "end",
      });
      offset += w + gap;
    }
    base -= lineH;
  }
  c.y = top - h - 10;
}

// ───────────────────────── Training ─────────────────────────

export type TrainingPdfData = {
  rtl: boolean;
  baseUrl: string;
  /**
   * This course's share token, carried on every exercise link so the video
   * page knows which course the member came from and can offer the way back.
   * Null for a template, which nobody is reading exercises out of.
   */
  courseToken?: string | null;
  /** Course author, printed at the foot of every page. Null hides the line. */
  authorName?: string | null;
  labels: {
    exerciseColumn: string;
    supersetColumn: string;
    age: string;
    height: string;
    weight: string;
    start: string;
    end: string;
    preparedBy: string;
  };
  member?: {
    name: string;
    age: number | null;
    height: number | null;
    weight: number | null;
    /** Already formatted "label: value" pairs; empty for male members. */
    measurements: string[];
    startDate: string | null;
    endDate: string | null;
  } | null;
  days: {
    label: string;
    exercises: {
      name: string;
      reps: string;
      videoToken: string | null;
      supersetGroup: number | null;
    }[];
  }[];
};

type Entry = { name: string; reps: string; link: string | null };
type Laid = { entry: Entry; lines: string[] };
type Columns = { num: Span; main: Span; sup: Span };

const GUTTER = 26;

/**
 * Number, exercise, superset — reading from the start edge. The exercise sits
 * on the start side (the right, in Arabic) and its superset partner directly
 * across from it.
 */
function trainingColumns(rtl: boolean): Columns {
  const colW = (CW - GUTTER) / 2;
  return rtl
    ? {
        num: { x: CM + CW - GUTTER, w: GUTTER },
        main: { x: CM + colW, w: colW },
        sup: { x: CM, w: colW },
      }
    : {
        num: { x: CM, w: GUTTER },
        main: { x: CM + GUTTER, w: colW },
        sup: { x: CM + GUTTER + colW, w: colW },
      };
}

/** Where the column dividers fall. */
function dividers(cols: Columns, rtl: boolean) {
  return rtl ? [cols.main.x, cols.num.x] : [cols.main.x, cols.sup.x];
}

function columnHeader(c: DarkCourse, cols: Columns, labels: TrainingPdfData["labels"]) {
  const h = 26;
  const top = c.y;
  c.b.page.drawRectangle({ x: CM, y: top - h, width: CW, height: h, color: CARD });
  const base = top - h / 2 - 5;
  c.draw("#", cols.num, base, { size: 12, color: SOFT, align: "center" });
  c.draw(labels.exerciseColumn, cols.main, base, { size: 14, color: LIME, align: "center" });
  c.draw(labels.supersetColumn, cols.sup, base, { size: 14, color: LIME, align: "center" });
  for (const x of dividers(cols, c.rtl)) c.vline(x, top, top - h);
  c.y = top - h;
}

function layEntry(c: DarkCourse, entry: Entry, span: Span): Laid {
  const repsW = entry.reps ? c.width(entry.reps, BODY) + 10 : 0;
  const avail = span.w - INSET * 2 - (entry.link ? MARK_W : 0) - repsW;
  return { entry, lines: c.wrap(entry.name, BODY, Math.max(avail, 40)) };
}

/**
 * The exercise name against the start edge of its cell, the reps against the
 * end edge, on the same line. A name with a video gets a small play mark and
 * is tappable — no underline, no link colour.
 */
function drawEntry(c: DarkCourse, laid: Laid, span: Span, base: number) {
  const { entry, lines } = laid;
  const markW = entry.link ? MARK_W : 0;
  if (entry.reps) {
    c.draw(entry.reps, span, base, { size: BODY, color: WHITE, align: "end", inset: INSET });
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  lines.forEach((line, i) => {
    const { x, w } = c.draw(line, span, base - i * LINE_H, {
      size: BODY,
      color: WHITE,
      align: "start",
      inset: INSET + markW,
    });
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + w);
  });
  if (entry.link) {
    const mx = c.rtl ? span.x + span.w - INSET - 6 : span.x + INSET;
    c.b.page.drawSvgPath("M0,0 L0,7 L6,3.5 Z", { x: mx, y: base + 7.5, color: LIME });
    x0 = Math.min(x0, mx);
    x1 = Math.max(x1, mx + 6);
    const bottom = base - (lines.length - 1) * LINE_H - 4;
    c.b.addLink(x0, bottom, x1 - x0, base + BODY + 2 - bottom, entry.link);
  }
  return lines.length;
}

function trainingRow(
  c: DarkCourse,
  cols: Columns,
  n: number,
  main: Entry,
  partners: Entry[],
  continueOnNewPage: () => void
) {
  const m = layEntry(c, main, cols.main);
  const ps = partners.map((p) => layEntry(c, p, cols.sup));
  const lines = Math.max(
    m.lines.length,
    ps.reduce((sum, p) => sum + p.lines.length, 0),
    1
  );
  const h = CELL_PAD * 2 + BODY + (lines - 1) * LINE_H + 3;
  if (c.y - h < CM) continueOnNewPage();

  const top = c.y;
  const bottom = top - h;
  const base = top - CELL_PAD - BODY + 1;
  c.draw(String(n), cols.num, base, { size: 10, color: SOFT, align: "center" });
  drawEntry(c, m, cols.main, base);
  let pb = base;
  for (const p of ps) pb -= drawEntry(c, p, cols.sup, pb) * LINE_H;

  for (const x of dividers(cols, c.rtl)) c.vline(x, top, bottom);
  c.hline(bottom);
  c.y = bottom;
}

function trainingCard(data: TrainingPdfData): CardItem[] | null {
  const m = data.member;
  if (!m) return null;
  const l = data.labels;
  // Phone and gender are deliberately not shown — the course is the member's
  // own, and their name is enough of a heading.
  const items: CardItem[] = [{ value: m.name, strong: true }];
  if (m.age != null) items.push({ label: l.age, value: String(m.age) });
  // Height and weight are separate fields, each read right-to-left after its
  // own label, rather than one "185 / 120" pair that flips in Arabic.
  if (m.height != null) items.push({ label: l.height, value: String(m.height) });
  if (m.weight != null) items.push({ label: l.weight, value: String(m.weight) });
  for (const measurement of m.measurements) items.push({ value: measurement });
  if (m.startDate) items.push({ label: l.start, value: m.startDate });
  if (m.endDate) items.push({ label: l.end, value: m.endDate });
  return items;
}

/** "Prepared by: <name>", or null when there is no author to print. */
function authorFooter(labels: { preparedBy: string }, name?: string | null) {
  return name ? `${labels.preparedBy}: ${name}` : null;
}

export async function buildTrainingPdf(data: TrainingPdfData): Promise<Uint8Array> {
  const c = await DarkCourse.create(data.rtl, authorFooter(data.labels, data.authorName));
  const card = trainingCard(data);
  const cols = trainingColumns(data.rtl);
  // The course token rides along so the video page can offer a way back to
  // the rest of the programme; without it a member watching one exercise has
  // nowhere to go but the browser's history.
  const back = data.courseToken ? `?c=${data.courseToken}` : "";
  const entry = (e: TrainingPdfData["days"][number]["exercises"][number]): Entry => ({
    name: e.name,
    reps: e.reps,
    link: e.videoToken ? `${data.baseUrl}/watch/${e.videoToken}${back}` : null,
  });

  if (!data.days.length) pageTop(c, "", card);

  data.days.forEach((day, d) => {
    if (d > 0) c.newPage();
    const top = () => {
      pageTop(c, day.label, card);
      columnHeader(c, cols, data.labels);
    };
    top();

    // Consecutive exercises sharing a superset group form one row: the first
    // in the exercise column, the rest stacked across from it.
    let n = 0;
    let i = 0;
    while (i < day.exercises.length) {
      const group = day.exercises[i].supersetGroup;
      let j = i + 1;
      if (group != null) {
        while (j < day.exercises.length && day.exercises[j].supersetGroup === group) j++;
      }
      const run = day.exercises.slice(i, j);
      n++;
      trainingRow(c, cols, n, entry(run[0]), run.slice(1).map(entry), () => {
        c.newPage();
        top();
      });
      i = j;
    }
  });

  return c.b.bytes();
}

// ───────────────────────── Nutrition ─────────────────────────

export type NutritionPdfData = {
  rtl: boolean;
  /** Course author, printed at the foot of every page. Null hides the line. */
  authorName?: string | null;
  labels: { preparedBy: string };
  member?: { name: string } | null;
  days: { label: string; meals: string[] }[];
};

function mealRow(c: DarkCourse, n: number, meal: string, continueOnNewPage: () => void) {
  const num: Span = c.rtl ? { x: CM + CW - GUTTER, w: GUTTER } : { x: CM, w: GUTTER };
  const text: Span = c.rtl ? { x: CM, w: CW - GUTTER } : { x: CM + GUTTER, w: CW - GUTTER };
  const lines = c.wrap(meal, BODY, text.w - INSET * 2);
  const h = CELL_PAD * 2 + BODY + (lines.length - 1) * LINE_H + 3;
  if (c.y - h < CM) continueOnNewPage();

  const top = c.y;
  const bottom = top - h;
  const base = top - CELL_PAD - BODY + 1;
  // The number sits in its own column: inside the bidi run a trailing "."
  // would drift away from the digit.
  c.draw(String(n), num, base, { size: 10, color: SOFT, align: "center" });
  lines.forEach((line, i) => {
    c.draw(line, text, base - i * LINE_H, { size: BODY, color: WHITE, inset: INSET });
  });
  c.vline(c.rtl ? num.x : text.x, top, bottom);
  c.hline(bottom);
  c.y = bottom;
}

export async function buildNutritionPdf(data: NutritionPdfData): Promise<Uint8Array> {
  const c = await DarkCourse.create(data.rtl, authorFooter(data.labels, data.authorName));
  const card: CardItem[] | null = data.member
    ? [{ value: data.member.name, strong: true }]
    : null;

  if (!data.days.length) pageTop(c, "", card);

  data.days.forEach((day, d) => {
    if (d > 0) c.newPage();
    const top = () => {
      pageTop(c, day.label, card);
      c.hline(c.y);
    };
    top();

    let n = 0;
    for (const meal of day.meals) {
      if (!meal.trim()) continue;
      n++;
      mealRow(c, n, meal, () => {
        c.newPage();
        top();
      });
    }
  });

  return c.b.bytes();
}
