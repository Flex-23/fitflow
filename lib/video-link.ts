/**
 * Videos that live somewhere else — YouTube, TikTok, or any other address.
 *
 * A linked video is played inside an iframe, so the address has to be turned
 * into the provider's embed form; the watch URL a member receives never
 * changes shape, because the course PDF only ever links to /watch/{token}.
 *
 * Client-safe: the upload form validates with the same rules the server does.
 */

export type VideoProvider = "youtube" | "tiktok" | "vimeo" | "other";

export type ParsedVideoLink = {
  provider: VideoProvider;
  /** The address to put in an iframe, or null when it cannot be embedded. */
  embedUrl: string | null;
  /** The address as given, normalised — what we store and link out to. */
  url: string;
};

/** Only these can carry a video; anything else is a phishing vector. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  // /embed/ID, /shorts/ID, /live/ID, /v/ID
  const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function tiktokId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (!/(^|\.)tiktok\.com$/.test(host)) return null;
  // https://www.tiktok.com/@user/video/1234567890
  const m = u.pathname.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

function vimeoId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (!/(^|\.)vimeo\.com$/.test(host)) return null;
  const m = u.pathname.match(/^\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Parse a pasted address. Returns null when it is not a usable URL at all,
 * which is the only case the form should refuse outright — an address we
 * cannot embed still opens in a new tab.
 */
export function parseVideoLink(input: string): ParsedVideoLink | null {
  const raw = input.trim();
  if (!raw) return null;

  let u: URL;
  try {
    // People paste "youtube.com/..." without a scheme far more often than not.
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
  if (!u.hostname.includes(".")) return null;

  const yt = youtubeId(u);
  if (yt) {
    return {
      provider: "youtube",
      // nocookie keeps YouTube from profiling the member; the start time is
      // carried over so a link to a moment inside a video still works.
      embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}${startParam(u)}`,
      url: u.toString(),
    };
  }

  const tt = tiktokId(u);
  if (tt) {
    return {
      provider: "tiktok",
      embedUrl: `https://www.tiktok.com/embed/v2/${encodeURIComponent(tt)}`,
      url: u.toString(),
    };
  }

  const vm = vimeoId(u);
  if (vm) {
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(vm)}`,
      url: u.toString(),
    };
  }

  // A direct file (.mp4 and friends) can be played by the browser itself.
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(u.pathname)) {
    return { provider: "other", embedUrl: null, url: u.toString() };
  }

  return { provider: "other", embedUrl: null, url: u.toString() };
}

/** `?t=90` / `?start=90` on a YouTube link, preserved into the embed. */
function startParam(u: URL): string {
  const t = u.searchParams.get("t") ?? u.searchParams.get("start");
  if (!t) return "";
  const seconds = /^\d+$/.test(t) ? Number(t) : parseHms(t);
  return seconds > 0 ? `?start=${seconds}` : "";
}

function parseHms(t: string): number {
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** True when the browser can play the address directly in a <video> tag. */
export function isDirectVideoFile(url: string): boolean {
  try {
    return /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function providerLabel(provider: VideoProvider): string {
  return { youtube: "YouTube", tiktok: "TikTok", vimeo: "Vimeo", other: "Link" }[provider];
}
