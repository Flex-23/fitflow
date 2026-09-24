/**
 * End-to-end check of the member-link path, without a browser.
 *
 * Runs the app's own delivery helper against the real database — minting a
 * token, writing the message and queueing it exactly as pressing the button
 * does — then watches the worker pick the row up and send it.
 *
 *   npm run check:portal -- <memberId|phone>
 *
 * With no argument it uses the most recently registered member. Nothing here
 * is a test fixture: the message really is sent, so point it at a number you
 * are happy to receive one on.
 */
import { prisma } from "../lib/prisma";
import { deliverPortalLink } from "../lib/portal-delivery";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const who = process.argv[2];

  const member = who
    ? await prisma.member.findFirst({
        where: { OR: [{ id: who }, { phone: { contains: who } }] },
        select: { id: true, name: true, phone: true },
      })
    : await prisma.member.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, phone: true },
      });

  if (!member) {
    console.error(who ? `No member matches "${who}".` : "There are no members yet.");
    process.exit(1);
  }

  const staff = await prisma.user.findFirst({
    where: { role: "MANAGER", isActive: true },
    select: { id: true },
  });
  if (!staff) {
    console.error("No active manager to attribute this to.");
    process.exit(1);
  }

  console.log(`member:  ${member.name}  ${member.phone}`);

  const res = await deliverPortalLink(staff.id, member);
  console.log("queue:  ", JSON.stringify(res));
  if (!res.ok) process.exit(1);

  if (res.sent !== "queued") {
    console.log("\nThe gym's number is not linked, so there is nothing for the worker to do.");
    return;
  }

  // The token is what the member's link carries; confirm one was minted.
  const after = await prisma.member.findUnique({
    where: { id: member.id },
    select: { portalToken: true, portalTokenExpiresAt: true },
  });
  console.log(
    "token:   ",
    after?.portalToken ? `${after.portalToken.slice(0, 8)}… until ${after.portalTokenExpiresAt?.toISOString()}` : "NONE"
  );

  const row = await prisma.whatsAppOutbox.findFirst({
    where: { kind: "portal" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    console.error("The row is not in the outbox.");
    process.exit(1);
  }
  console.log(`\nmessage:\n${row.text}\n`);

  process.stdout.write("waiting for the worker");
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    process.stdout.write(".");
    const now = await prisma.whatsAppOutbox.findUnique({ where: { id: row.id } });
    if (now && now.status !== "PENDING") {
      console.log(
        `\nresult:   ${now.status} after ${now.attempts} attempt(s)` +
          (now.lastError ? ` — ${now.lastError}` : "") +
          (now.sentAt ? ` at ${now.sentAt.toISOString().slice(11, 19)}` : "")
      );
      process.exit(now.status === "SENT" ? 0 : 1);
    }
  }
  console.log("\nStill pending after 80s — is `npm run whatsapp` running?");
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
