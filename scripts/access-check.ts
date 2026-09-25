/**
 * Prove the section guards, against a running server.
 *
 *   npm run check:access            (expects the app on :3000)
 *
 * Signs in as each role by minting the same session cookie the login action
 * would, then asks for every staff page and records whether it renders or
 * redirects. A guard that is merely hidden from the sidebar is not a guard;
 * this is what says whether the page itself refuses.
 *
 * Restores whatever it changed, so it is safe to run against real data.
 */
import { prisma } from "../lib/prisma";
import { encryptSession, SESSION_COOKIE } from "../lib/auth/session-crypto";
import { ALL_SECTIONS } from "../lib/auth/rbac";
import type { Section } from "@prisma/client";

const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";

/** Every staff page, with the section it should require. */
const PAGES: [string, Section][] = [
  ["/registration", "RECEPTION"],
  ["/active", "RECEPTION"],
  ["/expired", "RECEPTION"],
  ["/deferred", "RECEPTION"],
  ["/members", "RECEPTION"],
  ["/gate", "RECEPTION"],
  ["/training", "COACHING"],
  ["/nutrition", "COACHING"],
  ["/videos", "LIBRARY"],
  ["/summary", "FINANCE"],
  ["/reports", "FINANCE"],
  ["/expenses", "FINANCE"],
  ["/debts", "FINANCE"],
  ["/plans", "FINANCE"],
  ["/archive", "MANAGEMENT"],
  ["/activity", "MANAGEMENT"],
  ["/notifications", "MANAGEMENT"],
  ["/settings", "MANAGEMENT"],
  ["/backup", "MANAGEMENT"],
  ["/captains", "STAFF"],
];

async function cookieFor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await encryptSession(
    {
      userId: user.id,
      role: user.role,
      username: user.username,
      displayName: user.displayName,
    },
    new Date(Date.now() + 60_000)
  );
  return `${SESSION_COOKIE}=${token}`;
}

/**
 * True when the page rendered rather than sending the caller away.
 *
 * Not the status code: a guard that fires part-way through a streamed
 * response cannot change headers that have already gone, so Next answers 200
 * and puts the redirect in the body. The marker it leaves there is the only
 * honest signal, and reading the status instead makes every guard look
 * broken.
 */
async function opens(path: string, cookie: string): Promise<boolean> {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie } });
  if (res.status !== 200) return false;
  return !/NEXT_REDIRECT/.test(await res.text());
}

async function check(label: string, cookie: string, expected: Set<Section>) {
  let wrong = 0;
  const denied: string[] = [];
  const allowed: string[] = [];

  for (const [path, section] of PAGES) {
    const got = await opens(path, cookie);
    const want = expected.has(section);
    (got ? allowed : denied).push(path);
    if (got !== want) {
      wrong++;
      console.log(`    MISMATCH ${path}  expected ${want ? "open" : "refused"}, got ${got ? "open" : "refused"}`);
    }
  }

  console.log(`  ${label}`);
  console.log(`    opens  (${allowed.length}): ${allowed.join(" ") || "—"}`);
  console.log(`    refuses(${denied.length}): ${denied.join(" ") || "—"}`);
  console.log(`    ${wrong === 0 ? "all as expected" : `${wrong} MISMATCH(ES)`}\n`);
  return wrong;
}

async function main() {
  let wrong = 0;

  const master = await prisma.user.findFirst({ where: { role: "MASTER" } });
  const manager = await prisma.user.findFirst({ where: { role: "MANAGER", isActive: true } });
  const reception = await prisma.user.findFirst({ where: { role: "RECEPTION", isActive: true } });
  const captain = await prisma.user.findFirst({ where: { role: "CAPTAIN", isActive: true } });

  if (master) {
    wrong += await check("master", await cookieFor(master.id), new Set(ALL_SECTIONS));
  }
  if (reception) {
    wrong += await check("reception", await cookieFor(reception.id), new Set<Section>(["RECEPTION"]));
  }
  if (captain) {
    const expected = new Set<Section>(["COACHING"]);
    if (captain.canAddVideos) expected.add("LIBRARY");
    wrong += await check("captain", await cookieFor(captain.id), expected);
  }

  if (manager) {
    const original = manager.sections;
    const cookie = await cookieFor(manager.id);
    try {
      wrong += await check("manager, everything", cookie, new Set(original));

      await prisma.user.update({
        where: { id: manager.id },
        data: { sections: ["RECEPTION", "COACHING"] },
      });
      wrong += await check(
        "manager, reception + coaching only",
        cookie,
        new Set<Section>(["RECEPTION", "COACHING"])
      );

      await prisma.user.update({ where: { id: manager.id }, data: { sections: [] } });
      wrong += await check("manager, nothing granted", cookie, new Set<Section>());
    } finally {
      await prisma.user.update({ where: { id: manager.id }, data: { sections: original } });
      console.log(`  (restored ${manager.username}: ${original.join(", ") || "—"})`);
    }
  }

  // A manager created with a chosen set must see exactly that set from its
  // first sign-in — which is the whole point of picking the sections on the
  // form. Made and removed here, so this is safe against real data.
  const chosen: Section[] = ["RECEPTION", "FINANCE"];
  const fresh = await prisma.user.create({
    data: {
      displayName: "Access check",
      username: `accesscheck_${Date.now()}`,
      role: "MANAGER",
      hashedPassword: "x".repeat(60),
      canAddVideos: true,
      sections: chosen,
    },
  });
  try {
    wrong += await check(
      `a new manager created with: ${chosen.join(", ")}`,
      await cookieFor(fresh.id),
      new Set(chosen)
    );
  } finally {
    await prisma.user.delete({ where: { id: fresh.id } });
  }

  console.log(wrong === 0 ? "\nEvery page answered as it should." : `\n${wrong} page(s) answered wrongly.`);
  process.exit(wrong === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
