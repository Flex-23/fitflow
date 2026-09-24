import { NextResponse, type NextRequest } from "next/server";
import { createMemberSession } from "@/lib/member-session";
import { clientKey, lockedFor, recordFailure, clearFailures } from "@/lib/rate-limit";
import { consumePortalToken, PORTAL_RULE } from "@/lib/member-portal";

/**
 * Where a personal link lands: trades the token in the address for a session
 * cookie and sends the phone on to `/me`.
 *
 * This has to be a route handler. A Server Component may read cookies but not
 * write them, so doing it inside the page threw on the first open and then
 * reported the link as invalid on the reload.
 *
 * The token is burned here and never reaches `/me`, so it cannot leak through
 * a Referer header when the member later opens a YouTube or TikTok video, and
 * a screenshot of the address bar is worth nothing.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("k")?.trim();

  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.nextUrl));
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };

  if (!token) return to("/me");

  // Tokens are far too long to guess, but a throttle keeps anyone from
  // trying at the database's expense.
  const key = `portal:${await clientKey()}`;
  if ((await lockedFor(key)) > 0) return to("/me?e=locked");

  const entry = await consumePortalToken(token);
  if (!entry.ok) {
    await recordFailure(key, PORTAL_RULE);
    // Used, expired and never-existed all look the same from out here, on
    // purpose: the difference is only useful to someone probing.
    return to("/me?e=expired");
  }

  await clearFailures(key);
  await createMemberSession(entry.memberId, entry.name, entry.epoch);
  return to("/me");
}
