/**
 * Upload rules for exercise videos, shared by the browser form and the
 * server route so both enforce exactly the same limits. Client-safe: no
 * filesystem or server-only imports here.
 */

/** Hard ceiling for an uploaded exercise video. */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40 MB

/** Video containers we accept, mapped to the extension stored on disk. */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "video/x-msvideo": ".avi",
  "video/avi": ".avi",
  "video/mpeg": ".mpeg",
  "video/3gpp": ".3gp",
  "video/3gpp2": ".3g2",
  "video/x-ms-wmv": ".wmv",
  "video/x-flv": ".flv",
  "video/mp4v-es": ".mp4",
};

/**
 * Extension to store the file under. Always derived from the (validated)
 * MIME type, never from the uploaded filename — a caller-supplied name could
 * carry any extension.
 */
export function extensionFor(mimeType: string): string {
  return VIDEO_TYPES[mimeType] ?? ".mp4";
}

export function isAcceptedVideoType(mimeType: string): boolean {
  return mimeType in VIDEO_TYPES;
}
