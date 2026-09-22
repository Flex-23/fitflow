/**
 * Course PDFs are not stored anywhere — they are rendered on demand from the
 * course rows whenever `/p/{shareToken}` is opened or the WhatsApp worker
 * downloads one.
 *
 * Rendering takes a few hundred milliseconds and always reflects the current
 * course, which removes a whole class of problems: a serverless disk that
 * vanishes between requests, files outliving a deleted course, and stale
 * copies after an edit. Only the download filename lives here now.
 *
 * Client-safe: no server-only imports.
 */

export type CourseKind = "training" | "nutrition";

export function coursePdfFilename(kind: CourseKind, memberName: string): string {
  const base = kind === "training" ? "training" : "nutrition";
  const safe = memberName.replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "-");
  return `${base}-${safe || "course"}.pdf`;
}
