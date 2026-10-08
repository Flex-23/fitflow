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

/**
 * The gym's identity on the training course header. Edit these two lines per
 * copy of the system — one place, no other code to touch. (A real logo image
 * can replace the drawn emblem later.)
 */
export const GYM_BRAND = {
  name: "لايف تايم جم",
  nameEn: "LIFE TIME GYM",
  tagline: "FOR FITNESS",
};

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
 * The top of every page: the member's details in a box, then the day heading
 * on its own line beneath it. No brand line — the watermark carries the logo.
 */
function pageTop(c: DarkCourse, dayLabel: string, items: CardItem[] | null) {
  if (items?.length) memberCard(c, items);
  if (dayLabel) {
    const base = c.y - 18;
    c.draw(dayLabel, FULL, base, { size: 17, color: LIME, align: "start" });
    c.y = base - 12;
  } else if (!items?.length) {
    c.y -= 6;
  }
}

function memberCard(c: DarkCourse, items: CardItem[]) {
  const size = 12;
  const strongSize = 14;
  const gap = 20;
  const pad = 12;
  const lineH = 20;
  const labelGap = 4;
  const inner = CW - pad * 2;

  // Flow the items from the start edge, wrapping onto a new line when full.
  type Placed = { item: CardItem; lw: number; vw: number };
  const lines: Placed[][] = [[]];
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

  const h = pad * 2 + lines.length * lineH - 6;
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

  let base = top - pad - 12;
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
  c.y = top - h - 8;
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

const GUTTER = 26; // kept here: the nutrition course's mealRow still uses it.

/** "Prepared by: <name>", or null when there is no author to print. */
function authorFooter(labels: { preparedBy: string }, name?: string | null) {
  return name ? `${labels.preparedBy}: ${name}` : null;
}

// ─── Light theme: the member-facing training course ───
//
// A light, branded sheet — one day to a page, a red day bar, blue number
// badges, and each exercise beside its superset partner. The nutrition course
// keeps the dark style for now.

const L_INK = rgb(0.1, 0.11, 0.13);
const L_SOFT = rgb(0.42, 0.45, 0.5);
const L_RULE = rgb(0.58, 0.61, 0.68); // darker, more visible separators
const L_CARD = rgb(0.955, 0.965, 0.98);
const RED_BAR = rgb(0.85, 0.32, 0.33); // softer red
const BLUE = rgb(0.11, 0.28, 0.62); // text accent (labels, reps)
const BADGE = rgb(0.45, 0.6, 0.85); // lighter blue for the number badge
const PAPER = rgb(1, 1, 1);
/** Softer fills for the card and column header (toward transparent). */
const FILL_OPACITY = 0.55;

const LCM = 40;
const LCW = PAGE.w - LCM * 2;
const LBODY = 12.5;
const LLINE = 18;
const LPAD = 9;
const HEADER_H = 120;
/** Cap on the banner's height (points). Raise it for a taller header; set it
 *  above the natural full-width height (~197) to let the banner fill the page
 *  edge to edge. */
const BANNER_MAX_H = 210;

/** The gym's initials, for the drawn emblem placeholder (banner fallback). */
function brandInitials(): string {
  const src = GYM_BRAND.nameEn || GYM_BRAND.name;
  return src.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]!.toUpperCase()).join("");
}

/**
 * The gym's ready-made header banner (logo + name + title as one image), drawn
 * full-width at the top of every page. Drop a new `lib/pdf/header-banner.png`
 * per gym; if the file is absent the drawn header is used instead.
 */
const bannerCache = new Map<string, Uint8Array | null>();
function bannerBytes(file: string): Uint8Array | null {
  if (!bannerCache.has(file)) {
    try {
      bannerCache.set(file, new Uint8Array(fs.readFileSync(path.join(process.cwd(), "lib/pdf", file))));
    } catch {
      bannerCache.set(file, null);
    }
  }
  return bannerCache.get(file) ?? null;
}

class LightCourse {
  private constructor(
    readonly b: Builder,
    private footer: string | null,
    private note: string | null,
    private banner: PDFImage | null,
    readonly headerH: number
  ) {}

  static async create(rtl: boolean, footer: string | null, note: string | null, bannerFile: string) {
    const b = await Builder.create(rtl, COURSE_FONT);
    const raw = bannerBytes(bannerFile);
    const banner = raw ? await b.doc.embedPng(raw) : null;
    // Scale the banner down to the cap, keeping its aspect ratio (so it is
    // centred with white margins rather than stretched to full width).
    const headerH = banner
      ? Math.min(PAGE.w * (banner.height / banner.width), BANNER_MAX_H)
      : HEADER_H;
    const c = new LightCourse(b, footer, note, banner, headerH);
    c.paint();
    return c;
  }

  get rtl() { return this.b.rtl; }
  get y() { return this.b.y; }
  set y(v: number) { this.b.y = v; }

  newPage() { this.b.addPage(); this.paint(); }

  width(raw: string, size: number) { return this.b.widthOf(shapeForPdf(raw), size); }

  /** Draw raw text in a span; `bold` over-stamps to thicken (faux bold). */
  draw(
    raw: string,
    span: Span,
    y: number,
    opts: { size: number; color: Color; align?: Align; inset?: number; bold?: boolean }
  ) {
    const shaped = shapeForPdf(raw);
    const w = this.b.widthOf(shaped, opts.size);
    const inset = opts.inset ?? 0;
    const align = opts.align ?? "start";
    let x: number;
    if (align === "center") x = span.x + (span.w - w) / 2;
    else {
      const right = (align === "start") === this.rtl;
      x = right ? span.x + span.w - inset - w : span.x + inset;
    }
    this.b.page.drawText(shaped, { x, y, size: opts.size, font: this.b.font, color: opts.color });
    if (opts.bold) {
      this.b.page.drawText(shaped, { x: x + 0.4, y, size: opts.size, font: this.b.font, color: opts.color });
    }
    return { x, w };
  }

  wrap(raw: string, size: number, maxW: number): string[] {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = words[0];
    for (const word of words.slice(1)) {
      const next = `${line} ${word}`;
      if (this.width(next, size) <= maxW) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
    return lines;
  }

  rect(x: number, y: number, w: number, h: number, color: Color) {
    this.b.page.drawRectangle({ x, y, width: w, height: h, color });
  }

  /** A filled rectangle with rounded corners. `yTop` is the top edge. */
  roundRect(x: number, yTop: number, w: number, h: number, r: number, color: Color) {
    const rr = Math.min(r, h / 2, w / 2);
    // SVG path in y-down coordinates, origin at the top-left corner.
    const path =
      `M ${rr},0 L ${w - rr},0 Q ${w},0 ${w},${rr} L ${w},${h - rr} ` +
      `Q ${w},${h} ${w - rr},${h} L ${rr},${h} Q 0,${h} 0,${h - rr} ` +
      `L 0,${rr} Q 0,0 ${rr},0 Z`;
    this.b.page.drawSvgPath(path, { x, y: yTop, color, borderWidth: 0 });
  }

  rule(y: number, dashed = false) {
    this.b.page.drawLine({
      start: { x: LCM, y },
      end: { x: LCM + LCW, y },
      thickness: dashed ? 1 : 0.8,
      color: L_RULE,
      ...(dashed ? { dashArray: [1.4, 2.2] } : {}),
    });
  }

  vline(x: number, top: number, bottom: number) {
    this.b.page.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: 0.6, color: L_RULE });
  }

  private paint() {
    this.b.page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: PAPER });
    if (this.banner) {
      const w = this.headerH * (this.banner.width / this.banner.height);
      this.b.page.drawImage(this.banner, {
        x: (PAGE.w - w) / 2,
        y: PAGE.h - this.headerH - 4,
        width: w,
        height: this.headerH,
      });
    } else {
      trainingHeader(this);
    }
    footerBand(this, this.footer, this.note);
    this.b.y = PAGE.h - this.headerH - 18;
  }
}

/** The branded header, drawn at the top of every page. */
function trainingHeader(c: LightCourse) {
  const page = c.b.page;
  const cx = PAGE.w / 2;
  // Emblem placeholder (a real logo image can replace this later).
  const r = 19;
  const ey = PAGE.h - 32;
  page.drawCircle({ x: cx, y: ey, size: r, color: BLUE, borderColor: RED_BAR, borderWidth: 2 });
  c.draw(brandInitials(), { x: cx - r, w: r * 2 }, ey - 6, { size: 14, color: PAPER, align: "center", bold: true });
  // Gym name, prominent.
  c.draw(GYM_BRAND.name, { x: LCM, w: LCW }, PAGE.h - 70, { size: 24, color: L_INK, align: "center", bold: true });
  if (GYM_BRAND.nameEn) {
    const en = GYM_BRAND.tagline ? `${GYM_BRAND.nameEn}  -  ${GYM_BRAND.tagline}` : GYM_BRAND.nameEn;
    c.draw(en, { x: LCM, w: LCW }, PAGE.h - 85, { size: 9, color: L_SOFT, align: "center", bold: true });
  }
  // "كورس التدريب" red pill.
  const label = "كورس التدريب";
  const ls = 12;
  const pw = c.width(label, ls) + 24;
  c.rect(cx - pw / 2, PAGE.h - 111, pw, 20, RED_BAR);
  c.draw(label, { x: cx - pw / 2, w: pw }, PAGE.h - 111 + 6, { size: ls, color: PAPER, align: "center", bold: true });
  // Blue underline across the header.
  c.rect(LCM, PAGE.h - HEADER_H, LCW, 2, BLUE);
}

/** Trainer name (start edge) and the warm-up note (end edge), at the foot. */
function footerBand(c: LightCourse, footer: string | null, note: string | null) {
  const span: Span = { x: LCM, w: LCW };
  if (note) c.draw(note, span, 30, { size: 11, color: BLUE, align: "end", bold: true });
  if (footer) c.draw(footer, span, 30, { size: 13, color: BLUE, align: "start", bold: true });
}

/**
 * The member's details on a single line — a slim light bar with the name
 * (bold) and each fact as a blue label + ink value, spread evenly across the
 * width. The font shrinks to fit so it never wraps to a second line.
 */
function lightMemberRow(c: LightCourse, items: CardItem[]) {
  // Full page width, like the banner — so a long (three-part) name still fits.
  const edgePad = 30;
  const labelGap = 4;
  const inner = PAGE.w - edgePad * 2;
  const minGap = 12;

  const measure = (size: number, strongSize: number) =>
    items.map((it) => {
      const lw = it.label ? c.width(it.label, size) + labelGap : 0;
      const vw = c.width(it.value, it.strong ? strongSize : size);
      return { it, lw, w: lw + vw };
    });

  let size = 11;
  let strong = 12.5;
  let placed = measure(size, strong);
  let total = placed.reduce((s, p) => s + p.w, 0);
  // Shrink to fit one line when the facts are too wide for the bar.
  const need = total + minGap * (items.length - 1);
  if (need > inner) {
    const f = Math.max(inner / need, 0.7);
    size = Math.max(size * f, 8);
    strong = Math.max(strong * f, 9);
    placed = measure(size, strong);
    total = placed.reduce((s, p) => s + p.w, 0);
  }

  // Spread the slack between items (capped), and centre whatever is left over.
  let gap = items.length > 1 ? (inner - total) / (items.length - 1) : 0;
  gap = Math.min(Math.max(gap, minGap), 44);
  const lineW = total + gap * (items.length - 1);
  const startOffset = edgePad + Math.max(0, (inner - lineW) / 2);

  const h = 28;
  const top = c.y;
  c.b.page.drawRectangle({
    x: 0,
    y: top - h,
    width: PAGE.w,
    height: h,
    color: L_CARD,
    opacity: FILL_OPACITY,
  });
  const base = top - h + (h - size) / 2 + 1;

  let offset = startOffset;
  for (const { it, w } of placed) {
    const span: Span = c.rtl ? { x: PAGE.w - offset - w, w } : { x: offset, w };
    if (it.label) c.draw(it.label, span, base, { size, color: BLUE, align: "start", bold: true });
    c.draw(it.value, span, base, {
      size: it.strong ? strong : size,
      color: L_INK,
      align: "end",
      bold: it.strong,
    });
    offset += w + gap;
  }
  c.y = top - h - 14;
}

/** The red day bar with the day's name. */
function dayBar(c: LightCourse, label: string) {
  if (!label) return;
  const h = 24;
  const size = 13;
  const top = c.y;
  // The separator line sits above; the red bar drops below it.
  c.rule(top);
  const pillTop = top - 6;
  const pw = c.width(label, size) + 28;
  const x = c.rtl ? LCM + LCW - pw : LCM;
  c.roundRect(x, pillTop, pw, h, 7, RED_BAR);
  c.draw(label, { x, w: pw }, pillTop - h + 7, { size, color: PAPER, align: "center", bold: true });
  c.y = pillTop - h - 10;
}

type Cols = { num: Span; main: Span; sup: Span };

/** Number badge, exercise, superset — read from the start edge, side by side. */
function trainingColsLight(rtl: boolean): Cols {
  const numW = 24;
  const colW = (LCW - numW) / 2;
  return rtl
    ? {
        num: { x: LCM + LCW - numW, w: numW },
        main: { x: LCM + colW, w: colW },
        sup: { x: LCM, w: colW },
      }
    : {
        num: { x: LCM, w: numW },
        main: { x: LCM + numW, w: colW },
        sup: { x: LCM + numW + colW, w: colW },
      };
}

/** The vertical dividers between the three columns. */
function colDividers(cols: Cols, rtl: boolean) {
  return rtl ? [cols.main.x, cols.num.x] : [cols.main.x, cols.sup.x];
}

/** The light header row naming the two columns. */
function columnHeaderLight(c: LightCourse, cols: Cols, labels: TrainingPdfData["labels"]) {
  const h = 22;
  const top = c.y;
  c.b.page.drawRectangle({ x: LCM, y: top - h, width: LCW, height: h, color: L_CARD, opacity: FILL_OPACITY });
  const base = top - h / 2 - 4;
  c.draw("#", cols.num, base, { size: 11, color: L_SOFT, align: "center", bold: true });
  c.draw(labels.exerciseColumn, cols.main, base, { size: 12, color: BLUE, align: "center", bold: true });
  c.draw(labels.supersetColumn, cols.sup, base, { size: 12, color: BLUE, align: "center", bold: true });
  for (const x of colDividers(cols, c.rtl)) c.vline(x, top, top - h);
  // Shift the exercises down a little for breathing room below the header.
  c.y = top - h - 8;
}

/** Lay out one entry's wrapped lines within a column. */
function layCell(c: LightCourse, e: Entry, span: Span) {
  const repsW = e.reps ? c.width(e.reps, LBODY) + 10 : 0;
  const avail = span.w - INSET * 2 - (e.link ? MARK_W : 0) - repsW;
  return c.wrap(e.name, LBODY, Math.max(avail, 44));
}

/** Draw one entry inside a column: name on the start edge, reps on the end. */
function drawCell(c: LightCourse, e: Entry, lines: string[], span: Span, base: number) {
  const markW = e.link ? MARK_W : 0;
  if (e.reps) c.draw(e.reps, span, base, { size: LBODY, color: BLUE, align: "end", inset: INSET, bold: true });
  let x0 = Infinity;
  let x1 = -Infinity;
  lines.forEach((ln, i) => {
    const { x, w } = c.draw(ln, span, base - i * LLINE, {
      size: LBODY,
      color: L_INK,
      align: "start",
      inset: INSET + markW,
      bold: true,
    });
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + w);
  });
  if (e.link) {
    const mx = c.rtl ? span.x + span.w - INSET - 6 : span.x + INSET;
    c.b.page.drawSvgPath("M0,0 L0,7 L6,3.5 Z", { x: mx, y: base + 7.5, color: RED_BAR });
    x0 = Math.min(x0, mx);
    x1 = Math.max(x1, mx + 6);
    const bottom = base - (lines.length - 1) * LLINE - 4;
    c.b.addLink(x0, bottom, x1 - x0, base + LBODY + 2 - bottom, e.link);
  }
  return lines.length;
}

/**
 * One numbered item: a blue badge, the exercise in its column, and any superset
 * partner(s) in the column directly across from it. A video name gets a small
 * red play mark and is tappable.
 */
function drawGroup(c: LightCourse, cols: Cols, n: number, main: Entry, partners: Entry[], cont: () => void) {
  const mainLines = layCell(c, main, cols.main);
  const partLaid = partners.map((p) => ({ p, lines: layCell(c, p, cols.sup) }));
  const lines = Math.max(
    mainLines.length,
    partLaid.reduce((s, x) => s + x.lines.length, 0),
    1
  );
  const h = LPAD * 2 + LBODY + (lines - 1) * LLINE + 2;
  if (c.y - h < 52) cont();

  const top = c.y;
  const bottom = top - h;
  const base = top - LPAD - LBODY + 1;

  // Number badge in the number column — a lighter blue.
  const bsz = 16;
  const bx = cols.num.x + (cols.num.w - bsz) / 2;
  c.rect(bx, base - 3, bsz, bsz, BADGE);
  c.draw(String(n), { x: bx, w: bsz }, base, { size: 10, color: PAPER, align: "center", bold: true });

  drawCell(c, main, mainLines, cols.main, base);
  let pb = base;
  for (const { p, lines: pl } of partLaid) pb -= drawCell(c, p, pl, cols.sup, pb) * LLINE;

  for (const x of colDividers(cols, c.rtl)) c.vline(x, top, bottom);
  c.rule(bottom, true);
  c.y = bottom;
}

/** The member facts shown in the card at the top of the page. */
function trainingCardLight(data: TrainingPdfData): CardItem[] | null {
  const m = data.member;
  if (!m) return null;
  const l = data.labels;
  const items: CardItem[] = [{ value: m.name, strong: true }];
  if (m.age != null) items.push({ label: l.age, value: String(m.age) });
  if (m.height != null) items.push({ label: l.height, value: String(m.height) });
  if (m.weight != null) items.push({ label: l.weight, value: String(m.weight) });
  for (const measurement of m.measurements) items.push({ value: measurement });
  if (m.startDate) items.push({ label: l.start, value: m.startDate });
  if (m.endDate) items.push({ label: l.end, value: m.endDate });
  return items;
}

export async function buildTrainingPdf(data: TrainingPdfData): Promise<Uint8Array> {
  const note = data.rtl
    ? "الإحماء ضروري قبل التمرين • الالتزام بتعليمات المدرب"
    : "Warm up before training • follow your coach's instructions";
  const c = await LightCourse.create(data.rtl, authorFooter(data.labels, data.authorName), note, "header-banner.png");
  const card = trainingCardLight(data);
  const cols = trainingColsLight(data.rtl);
  // The course token rides along so the video page can offer a way back.
  const back = data.courseToken ? `?c=${data.courseToken}` : "";
  const entry = (e: TrainingPdfData["days"][number]["exercises"][number]): Entry => ({
    name: e.name,
    reps: e.reps,
    link: e.videoToken ? `${data.baseUrl}/watch/${e.videoToken}${back}` : null,
  });

  if (!data.days.length && card) lightMemberRow(c, card);

  data.days.forEach((day, d) => {
    if (d > 0) c.newPage();
    if (card) lightMemberRow(c, card);
    const drawHead = () => {
      dayBar(c, day.label);
      columnHeaderLight(c, cols, data.labels);
    };
    drawHead();

    // Consecutive exercises sharing a superset group form one numbered item:
    // the first in the exercise column, its partner(s) across in the superset
    // column.
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
      drawGroup(c, cols, n, entry(run[0]), run.slice(1).map(entry), () => {
        c.newPage();
        drawHead();
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
  labels: { preparedBy: string; age: string; height: string; weight: string };
  member?: {
    name: string;
    age: number | null;
    height: number | null;
    weight: number | null;
    /** Already formatted "label: value" pairs; empty for male members. */
    measurements: string[];
  } | null;
  days: { label: string; meals: string[] }[];
};

/** Member facts for the nutrition card — name, age, height, weight (no dates). */
function nutritionCardLight(data: NutritionPdfData): CardItem[] | null {
  const m = data.member;
  if (!m) return null;
  const l = data.labels;
  const items: CardItem[] = [{ value: m.name, strong: true }];
  if (m.age != null) items.push({ label: l.age, value: String(m.age) });
  if (m.height != null) items.push({ label: l.height, value: String(m.height) });
  if (m.weight != null) items.push({ label: l.weight, value: String(m.weight) });
  for (const measurement of m.measurements) items.push({ value: measurement });
  return items;
}

/** One numbered meal, full width, with a blue badge and a dotted separator. */
function mealRowLight(c: LightCourse, n: number, meal: string, cont: () => void) {
  const bsz = 16;
  const textSpan: Span = c.rtl
    ? { x: LCM, w: LCW - (bsz + 10) }
    : { x: LCM + bsz + 10, w: LCW - (bsz + 10) };
  const lines = c.wrap(meal, LBODY, textSpan.w - INSET * 2);
  const h = LPAD * 2 + LBODY + (lines.length - 1) * LLINE + 2;
  if (c.y - h < 52) cont();

  const top = c.y;
  const bottom = top - h;
  const base = top - LPAD - LBODY + 1;

  const bx = c.rtl ? LCM + LCW - bsz : LCM;
  c.rect(bx, base - 3, bsz, bsz, BADGE);
  c.draw(String(n), { x: bx, w: bsz }, base, { size: 10, color: PAPER, align: "center", bold: true });

  lines.forEach((ln, i) => {
    c.draw(ln, textSpan, base - i * LLINE, { size: LBODY, color: L_INK, align: "start", inset: INSET, bold: true });
  });

  c.rule(bottom, true);
  c.y = bottom;
}

export async function buildNutritionPdf(data: NutritionPdfData): Promise<Uint8Array> {
  const note = data.rtl
    ? "التزم بالكميات والمواعيد • اشرب ماءً كافيًا يوميًا"
    : "Follow the amounts and timing • drink enough water daily";
  const c = await LightCourse.create(data.rtl, authorFooter(data.labels, data.authorName), note, "nutrition-banner.png");
  const card = nutritionCardLight(data);

  if (!data.days.length && card) lightMemberRow(c, card);

  data.days.forEach((day, d) => {
    if (d > 0) c.newPage();
    if (card) lightMemberRow(c, card);
    const drawHead = () => dayBar(c, day.label);
    drawHead();

    let n = 0;
    for (const meal of day.meals) {
      if (!meal.trim()) continue;
      n++;
      mealRowLight(c, n, meal, () => {
        c.newPage();
        drawHead();
      });
    }
  });

  return c.b.bytes();
}
