import { NextRequest, NextResponse } from "next/server";
import { decryptSession, SESSION_COOKIE } from "@/lib/auth/session-crypto";
import { roleHome } from "@/lib/auth/rbac";

// Next.js 16 renamed Middleware to Proxy. This runs optimistic auth checks
// (cookie only, no DB) — the secure checks live in the Data Access Layer.
// Everything is protected except the public surfaces below.
// "/p" serves course PDFs through a private share token (sent over WhatsApp),
// and "/me" is the member's own page, which carries a member session rather
// than a staff one. "/offline" is the page the service worker keeps a copy of,
// so it must render without a session — there is no server to check one.
const PUBLIC_PREFIXES = ["/login", "/watch", "/p", "/me", "/offline"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/" ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);

  if (!isPublic && !session) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && session) {
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
