/**
 * Where each address sends you, for each kind of visitor.
 *
 *   npm run check:entry
 *
 * The bug this exists for: a browser that had once opened a member's link
 * kept a session for a month, and "/" handed that browser the member's page
 * instead of the sign-in form — for good, with nothing on screen to undo it.
 * So every row below is run three times: signed out, holding a member
 * session, and holding a staff one.
 */
import { prisma } from "../lib/prisma";
import { encryptSession, SESSION_COOKIE } from "../lib/auth/session-crypto";
import { MEMBER_COOKIE } from "../lib/member-session";
import { SignJWT } from "jose";
import { readdirSync } from "node:fs";
import { STAFF_PREFIXES } from "../lib/auth/routes";

const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";

/** Mint the member cookie the same way createMemberSession does. */
async function memberCookie(memberId: string, name: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const token = await new SignJWT({ m: memberId, n: name, e: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + 60_000))
    .sign(new TextEncoder().encode(secret));
  return `${MEMBER_COOKIE}=${token}`;
}

async function staffCookie() {
  const user = await prisma.user.findFirst({ where: { role: "MASTER" } });
  if (!user) return null;
  const token = await encryptSession(
    { userId: user.id, role: user.role, username: user.username, displayName: user.displayName },
    new Date(Date.now() + 60_000)
  );
  return `${SESSION_COOKIE}=${token}`;
}

/** Follow the redirects a browser would, and report where it stopped. */
async function lands(path: string, cookie: string): Promise<string> {
  let at = path;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(`${BASE}${at}`, { redirect: "manual", headers: { cookie } });
    const to = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && to) {
      at = new URL(to, BASE).pathname + new URL(to, BASE).search;
      continue;
    }
    // A guard that fires mid-stream answers 200 with the destination in the
    // body rather than in a header.
    const body = await res.text();
    const inBody = body.match(/NEXT_REDIRECT[^"]*?;(\/[^;"]*)/);
    if (inBody?.[1]) {
      at = inBody[1];
      continue;
    }
    if (/NEXT_HTTP_ERROR_FALLBACK/.test(body)) return `${at} (not found)`;
    // The status matters for a page that simply is not there: a 404 tells a
    // browser and a crawler the truth, a 200 with an apology does not.
    return res.status === 200 ? at : `${at} (${res.status})`;
  }
  return `${at} (too many hops)`;
}

/**
 * The proxy list has to match the pages that exist, or a real page stops
 * being bounced to sign-in (harmless — the page still guards itself) or a
 * missing one starts being (the 404-after-login bug, back again).
 */
function routeListMatchesPages(): number {
  const dir = "app/(app)";
  const onDisk = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `/${e.name}`)
    .sort();
  // Widened to string: the tuple is deliberately literal so a typo in the
  // list is a type error, but here it is being compared against disk.
  const declared: string[] = [...STAFF_PREFIXES].sort();

  const missing = onDisk.filter((p) => !declared.includes(p));
  const extra = declared.filter((p) => !onDisk.includes(p));

  console.log("\nthe proxy's list of staff pages");
  console.log(`   ${onDisk.length} page(s) on disk, ${declared.length} declared`);
  for (const p of missing) console.log(`   MISSING from the list: ${p}`);
  for (const p of extra) console.log(`   declared but no page:  ${p}`);
  if (!missing.length && !extra.length) console.log("   they agree");
  return missing.length + extra.length;
}

async function main() {
  const wrong = routeListMatchesPages();
  if (wrong) process.exitCode = 1;

  const member = await prisma.member.findFirst({ select: { id: true, name: true } });
  if (!member) throw new Error("no member to sign in as");

  const visitors: [string, string][] = [
    ["signed out", ""],
    ["holding a member session", await memberCookie(member.id, member.name)],
  ];
  const staff = await staffCookie();
  if (staff) visitors.push(["holding a staff session", staff]);

  const paths = ["/", "/me", "/login", "/logn"];

  for (const [who, cookie] of visitors) {
    console.log(`\n${who}`);
    for (const p of paths) {
      console.log(`   ${p.padEnd(10)} -> ${await lands(p, cookie)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
