import { NextResponse, type NextRequest } from "next/server";
import { createMemberSession, getMemberSession, clearMemberSession } from "@/lib/member-session";
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

  // WhatsApp fetches every link it is shown to build the little preview card,
  // and so do other chat apps. A single-use token must survive that: only a
  // real navigation — a person tapping the link — is allowed to spend it.
  // Crawlers ask for the document without these headers and are simply sent
  // on, which costs them nothing and the member nothing.
  const mode = req.headers.get("sec-fetch-mode");
  const dest = req.headers.get("sec-fetch-dest");
  const isNavigation = mode === "navigate" || dest === "document";
  if (!isNavigation) return to("/me");

  // Tokens are far too long to guess, but a throttle keeps anyone from
  // trying at the database's expense.
  const key = `portal:${await clientKey()}`;
  if ((await lockedFor(key)) > 0) return to("/me?e=locked");

  const entry = await consumePortalToken(token);
  if (!entry.ok) {
    // Tapping the same link twice is the commonest way to land here, and the
    // phone is already signed in — show the page rather than an error about a
    // link that did its job. But only when it is signed in as the member this
    // link was for: a phone holding someone else's session (a shared phone,
    // or staff who opened a member's link to check it) must never be shown
    // that other person's page in answer to this link. That session is
    // dropped instead, and the link reported as expired.
    const session = await getMemberSession();
    const linkFor = req.nextUrl.searchParams.get("m")?.trim();
    if (session && linkFor && session.memberId === linkFor) return to("/me");
    if (session) await clearMemberSession();

    await recordFailure(key, PORTAL_RULE);
    // Used, expired and never-existed all look the same from out here, on
    // purpose: the difference is only useful to someone probing.
    return to("/me?e=expired");
  }

  await clearFailures(key);
  await createMemberSession(entry.memberId, entry.name, entry.epoch);
  return to("/me");
}
