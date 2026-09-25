import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  PDFDocument,
  PDFFont,
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
export const LINK = rgb(0.13, 0.42, 0.78);
export const RULE = rgb(0.88, 0.88, 0.9);
export const GREEN = rgb(0.16, 0.6, 0.35);
export const RED = rgb(0.8, 0.22, 0.2);

let fontCache: Uint8Array | null = null;
function fontBytes(): Uint8Array {
  if (!fontCache) {
    fontCache = new Uint8Array(
      fs.readFileSync(path.join(process.cwd(), "lib/pdf/fonts/Amiri-Regular.ttf"))
    );
  }
  return fontCache;
}

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

  static async create(rtl: boolean) {
    const b = new Builder();
    b.doc = await PDFDocument.create();
    b.doc.registerFontkit(visualOrderFontkit);
    // Never subset: fontkit's subsetter drops the components of Amiri's
    // composite glyphs, leaving most letters blank in every viewer. The full
    // font adds ~210 KB compressed, which WhatsApp handles fine.
    b.font = await b.doc.embedFont(fontBytes(), { subset: false });
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
      link?: string | null;
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
    if (opts.link) {
      const w = this.widthOf(shaped, size);
      this.page.drawLine({
        start: { x, y: this.y - 1.5 },
        end: { x: x + w, y: this.y - 1.5 },
        thickness: 0.6,
        color: LINK,
      });
      this.addLink(x, this.y - 3, w, size + 4, opts.link);
    }
  }

  private addLink(x: number, y: number, w: number, h: number, url: string) {
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

export type TrainingPdfData = {
  rtl: boolean;
  baseUrl: string;
  /**
   * This course's share token, carried on every exercise link so the video
   * page knows which course the member came from and can offer the way back.
   * Null for a template, which nobody is reading exercises out of.
   */
  courseToken?: string | null;
  labels: {
    programTitle: string;
    reps: string;
    superset: string;
    phone: string;
    age: string;
    heightWeight: string;
    period: string;
    gender: string;
    /** Extra body measurements, pre-labelled ("Chest: 88 · Waist: 68 …"). */
    measurements: string;
  };
  member?: {
    name: string;
    phone: string;
    gender: string;
    age: number | null;
    height: number | null;
    weight: number | null;
    /** Already formatted "label: value" pairs; empty for male members. */
    measurements: string[];
    startDate: string | null;
    endDate: string | null;
  } | null;
  title?: string | null;
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

export async function buildTrainingPdf(data: TrainingPdfData): Promise<Uint8Array> {
  const b = await Builder.create(data.rtl);
  header(b, data.title || data.labels.programTitle, data.member?.name);

  if (data.member) {
    const m = data.member;
    b.text(`${data.labels.phone}: ${m.phone}   ${data.labels.gender}: ${m.gender}`, {
      size: 10,
      color: MUTED,
    });
    b.y -= 14;
    const bits: string[] = [];
    if (m.age != null) bits.push(`${data.labels.age}: ${m.age}`);
    if (m.height != null || m.weight != null)
      bits.push(`${data.labels.heightWeight}: ${m.height ?? "-"} / ${m.weight ?? "-"}`);
    if (bits.length) {
      b.text(bits.join("   "), { size: 10, color: MUTED });
      b.y -= 14;
    }
    if (m.measurements.length) {
      b.text(`${data.labels.measurements}: ${m.measurements.join("  ·  ")}`, {
        size: 10,
        color: MUTED,
      });
      b.y -= 14;
    }
    if (m.startDate && m.endDate) {
      // En dash, not an arrow: Amiri has no arrow glyphs (they render as boxes).
      b.text(`${data.labels.period}: ${m.startDate} – ${m.endDate}`, {
        size: 10,
        color: MUTED,
      });
      b.y -= 14;
    }
  }
  b.y -= 4;
  rule(b);

  for (const day of data.days) {
    sectionBar(b, day.label);
    // Group consecutive exercises sharing a superset group.
    let i = 0;
    while (i < day.exercises.length) {
      const ex = day.exercises[i];
      const group = ex.supersetGroup;
      const run: typeof day.exercises = [ex];
      let j = i + 1;
      if (group != null) {
        while (j < day.exercises.length && day.exercises[j].supersetGroup === group) {
          run.push(day.exercises[j]);
          j++;
        }
      }
      if (run.length > 1) {
        b.ensure(24);
        // "›" is one of the few marker glyphs Amiri ships. Inside an RTL run
        // the bidi mirroring flips it to "‹", so it points into the text.
        b.text(`› ${data.labels.superset}`, {
          size: 10,
          indent: 8,
          color: rgb(0.5, 0.35, 0.05),
        });
        b.y -= 16;
        for (const r of run) exerciseRow(b, data, r, 22);
      } else {
        exerciseRow(b, data, ex, 8);
      }
      i = j;
    }
    b.y -= 8;
  }

  return b.bytes();
}

function exerciseRow(
  b: Builder,
  data: TrainingPdfData,
  ex: { name: string; reps: string; videoToken: string | null },
  indent: number
) {
  b.ensure(20);
  // The course token rides along so the video page can offer a way back to
  // the rest of the programme; without it a member watching one exercise has
  // nowhere to go but the browser's history.
  const back = data.courseToken ? `?c=${data.courseToken}` : "";
  const link = ex.videoToken ? `${data.baseUrl}/watch/${ex.videoToken}${back}` : null;
  b.text(`• ${ex.name}`, {
    size: 11,
    indent,
    link,
    color: link ? LINK : INK,
  });
  b.text(`${ex.reps} ${data.labels.reps}`, { size: 11, align: "end", color: MUTED });
  b.y -= 18;
}

export type NutritionPdfData = {
  rtl: boolean;
  labels: { programTitle: string; phone: string };
  member?: { name: string; phone: string } | null;
  days: { label: string; meals: string[] }[];
};

export async function buildNutritionPdf(data: NutritionPdfData): Promise<Uint8Array> {
  const b = await Builder.create(data.rtl);
  header(b, data.labels.programTitle, data.member?.name);
  if (data.member) {
    b.text(`${data.labels.phone}: ${data.member.phone}`, { size: 10, color: MUTED });
    b.y -= 16;
  }
  rule(b);

  for (const day of data.days) {
    sectionBar(b, day.label);
    day.meals.forEach((meal, idx) => {
      if (!meal.trim()) return;
      b.ensure(18);
      // The number sits in its own column: inside the bidi run a trailing
      // "." would drift away from the digit.
      b.text(String(idx + 1), { size: 11, indent: 8, color: MUTED });
      b.text(meal, { size: 11, indent: 28 });
      b.y -= 17;
    });
    b.y -= 8;
  }

  return b.bytes();
}
