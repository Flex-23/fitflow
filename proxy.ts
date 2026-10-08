import { NextRequest, NextResponse } from "next/server";
import { decryptSession, SESSION_COOKIE } from "@/lib/auth/session-crypto";
import { roleHome } from "@/lib/auth/rbac";
import { isStaffPath, startsWithSegment } from "@/lib/auth/routes";
import { demoMode } from "@/lib/auth/demo";

// Next.js 16 renamed Middleware to Proxy. This runs optimistic auth checks
// (cookie only, no DB) — the secure checks live in the Data Access Layer.
//
// "/p" serves course PDFs through a private share token (sent over WhatsApp),
// and "/me" is the member's own page, which carries a member session rather
// than a staff one. "/offline" is the page the service worker keeps a copy of,
// so it must render without a session — there is no server to check one.
// "/access" is the master's own sign-in, at an address only the owner knows;
// the page itself 404s unless the segment matches, so letting the prefix
// through here reveals nothing.
const PUBLIC_PREFIXES = [
  "/login",
  "/watch",
  "/p",
  "/me",
  "/offline",
  "/access",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/" || PUBLIC_PREFIXES.some((p) => startsWithSegment(pathname, p));

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);

  // Only a real staff page is worth sending to the sign-in form. Anything
  // else is not a page, and bouncing a typo through sign-in and back to
  // itself means signing in successfully and landing on a 404.
  //
  // Forgetting to add a new page to that list is safe: it falls through to
  // the page, which calls requireSection and redirects the same way. The
  // proxy saves a round trip; it is not what protects anything.
  if (!isPublic && !session && isStaffPath(pathname) && !demoMode()) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (startsWithSegment(pathname, "/login") && session) {
    // The Data Access Layer sends sessions whose user no longer exists (or was
    // deactivated) here. Server Components cannot clear cookies, but the proxy
    // can — so the dead cookie dies on the login page itself.
    if (req.nextUrl.searchParams.get("stale")) {
      const res = NextResponse.next();
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return NextResponse.redirect(new URL(roleHome(session.role), req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
