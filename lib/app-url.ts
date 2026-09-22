/**
 * The app's public address, used for the course share links and for the
 * exercise-video links embedded in generated PDFs.
 *
 * `NEXT_PUBLIC_APP_URL` wins when it is set — that is the one to use for a
 * custom domain. Otherwise the hosting platform's own answer is trusted, so
 * a fresh deployment produces working links before anyone has configured
 * anything. Falls back to localhost for development.
 *
 * Client-safe, but note that only `NEXT_PUBLIC_*` reaches the browser: the
 * platform variables below resolve on the server, which is where every caller
 * of this needs them.
 */

function withProtocol(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

export function appUrl(): string {
  const clean = (v: string | undefined) => {
    const t = v?.trim();
    return t ? withProtocol(t).replace(/\/+$/, "") : null;
  };

  const explicit = clean(process.env.NEXT_PUBLIC_APP_URL);
  const platform =
    // Vercel's stable production domain — a custom one once it is attached,
    // otherwise <project>.vercel.app. Not the per-deployment URL.
    clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    // Last resort: this exact deployment. Changes on every deploy, so a link
    // built from it ages out, but it beats emitting localhost.
    clean(process.env.VERCEL_URL);

  // A localhost value is never the public address of a hosted deployment —
  // it is a setting someone forgot to update, and it produces share links no
  // member can open. Prefer what the platform reports about itself.
  if (explicit && !(platform && isLocalUrl(explicit))) return explicit;
  return platform ?? explicit ?? "http://localhost:3000";
}

/** True when the address would not open on a member's phone. */
export function isLocalUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\.local(?::|\/|$)/i.test(url);
}
