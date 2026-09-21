import { convertArabic } from "arabic-reshaper";
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(s: string): boolean {
  return ARABIC.test(s);
}

/**
 * Prepare a string for drawing with pdf-lib, which lays glyphs out in raw
 * string order with no shaping. We reshape Arabic into presentation forms
 * (joining) and apply the Unicode bidi algorithm to get visual order.
 */
export function shapeForPdf(text: string): string {
  if (!text) return text;
  const arabic = hasArabic(text);
  const reshaped = arabic ? convertArabic(text) : text;
  const levels = bidi.getEmbeddingLevels(reshaped, arabic ? "rtl" : "ltr");
  const segments = bidi.getReorderSegments(reshaped, levels);
  const chars = Array.from(reshaped);
  for (const [start, end] of segments) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = 0; i < slice.length; i++) chars[start + i] = slice[i];
  }
  return chars.join("");
}
