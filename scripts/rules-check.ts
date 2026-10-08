/**
 * The rules behind two lists, checked against real data.
 *
 *   npm run check:rules
 *
 * Both are time-windowed, which is the kind of rule that looks right in a
 * diff and is wrong by a day. This makes throwaway members on either side of
 * each boundary, asks the real query which ones it picks up, and removes
 * them again.
 */
import { prisma } from "../lib/prisma";
import { getLiveNotifications, EXPIRED_NOTICE_MS } from "../lib/notifications-live";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A member with one subscription that ended (or ends) at `endDate`. */
async function seed(label: string, endDate: Date, planName = "check") {
  const member = await prisma.member.create({
    data: {
      name: `zz-check ${label}`,
      phone: `0000${Date.now() % 1_000_000}${Math.floor(Math.random() * 100)}`,
      gender: "MALE",
      subscriptions: {
        create: {
          planName,
          price: 0,
          durationDays: 30,
          method: "CASH",
          status: endDate < new Date() ? "EXPIRED" : "ACTIVE",
          startDate: new Date(endDate.getTime() - 30 * DAY),
          endDate,
        },
      },
    },
    select: { id: true, name: true },
  });
  return member;
}

async function main() {
  const now = Date.now();
  const made: string[] = [];

  const cases: [string, Date][] = [
    ["ended 1h ago", new Date(now - 1 * HOUR)],
    ["ended 41h ago", new Date(now - 41 * HOUR)],
    ["ended 43h ago", new Date(now - 43 * HOUR)],
    ["ended 20 days ago", new Date(now - 20 * DAY)],
    ["ended 40 days ago", new Date(now - 40 * DAY)],
  ];

  try {
    for (const [label, end] of cases) made.push((await seed(label, end)).id);

    // ── notifications: the 42-hour window after expiry ──────────────────
    const n = await getLiveNotifications();
    const shown = new Set(n.justExpired.map((s) => s.memberId));
    console.log(`notifications — "just expired" lasts ${EXPIRED_NOTICE_MS / HOUR}h\n`);
    for (const [label, end] of cases) {
      const member = await prisma.member.findFirstOrThrow({
        where: { name: `zz-check ${label}` },
        select: { id: true },
      });
      const age = (now - end.getTime()) / HOUR;
      const want = age < EXPIRED_NOTICE_MS / HOUR;
      const got = shown.has(member.id);
      console.log(
        `  ${label.padEnd(20)} listed: ${String(got).padEnd(6)} expected: ${String(want).padEnd(6)} ${got === want ? "ok" : "MISMATCH"}`
      );
    }

    // ── archive: expired more than a month ago ──────────────────────────
    const today = new Date();
    const cutoff = new Date(now - 30 * DAY);
    const archived = await prisma.member.findMany({
      where: {
        subscriptions: { none: { status: { in: ["ACTIVE", "FROZEN"] }, endDate: { gt: today } } },
        NOT: { subscriptions: { none: {} } },
        name: { startsWith: "zz-check" },
      },
      include: { subscriptions: { orderBy: { endDate: "desc" }, take: 1 } },
    });
    const inArchive = new Set(
      archived
        .filter((m) => (m.subscriptions[0]?.endDate.getTime() ?? 0) < cutoff.getTime())
        .map((m) => m.name)
    );

    console.log("\narchive — expired more than 30 days ago\n");
    for (const [label, end] of cases) {
      const days = (now - end.getTime()) / DAY;
      const want = days > 30;
      const got = inArchive.has(`zz-check ${label}`);
      console.log(
        `  ${label.padEnd(20)} listed: ${String(got).padEnd(6)} expected: ${String(want).padEnd(6)} ${got === want ? "ok" : "MISMATCH"}`
      );
    }

    // A member who never subscribed must not appear at all.
    const never = await prisma.member.create({
      data: { name: "zz-check never subscribed", phone: `0001${Date.now() % 1_000_000}`, gender: "MALE" },
      select: { id: true, name: true },
    });
    made.push(never.id);
    const withNever = await prisma.member.findMany({
      where: { NOT: { subscriptions: { none: {} } }, name: { startsWith: "zz-check" } },
      select: { name: true },
    });
    const neverListed = withNever.some((m) => m.name === never.name);
    console.log(
      `  ${"never subscribed".padEnd(20)} listed: ${String(neverListed).padEnd(6)} expected: false  ${neverListed ? "MISMATCH" : "ok"}`
    );
  } finally {
    await prisma.member.deleteMany({ where: { name: { startsWith: "zz-check" } } });
    console.log("\n(test members removed)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
