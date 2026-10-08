/**
 * What the gate switch actually hides, checked against a running server.
 *
 *   npm run check:gate
 *
 * The switch is only worth having if turning it off removes the gate page
 * and the card number everywhere, not just from the sidebar. This flips it
 * both ways, asks the pages, and puts the setting back as it found it.
 */
import { prisma } from "../lib/prisma";
import { encryptSession, SESSION_COOKIE } from "../lib/auth/session-crypto";
import { GATE_ENABLED_KEY } from "../lib/gate/enabled";
import { setSetting, getSetting } from "../lib/settings";

const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";

async function cookieForSectionHolder() {
  const user =
    (await prisma.user.findFirst({ where: { role: "MASTER" } })) ??
    (await prisma.user.findFirst({ where: { role: "MANAGER", isActive: true } }));
  if (!user) throw new Error("no master or manager to sign in as");

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

async function page(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie } });
  const body = res.status === 200 ? await res.text() : "";
  return { status: res.status, body };
}

async function main() {
  const cookie = await cookieForSectionHolder();
  const original = await getSetting(GATE_ENABLED_KEY, "");

  try {
    for (const enabled of [true, false]) {
      await setSetting(GATE_ENABLED_KEY, enabled ? "true" : "false");

      const gate = await page("/gate", cookie);
      const reg = await page("/registration", cookie);

      // The sidebar link, the page itself, and the card field on the form.
      //
      // A guard that fires part-way through a streamed response cannot change
      // headers already sent, so Next answers 200 and puts the outcome in the
      // body — both for a redirect and for notFound(). The markers are the
      // honest signal; the status code is not.
      const linked = reg.body.includes('href="/gate"');
      const refused = /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/.test(gate.body);
      const opens = gate.status === 200 && !refused;
      const cardField = reg.body.includes('name="cardNumber"');

      console.log(`gate ${enabled ? "on " : "off"} ->`);
      console.log(`   sidebar link:   ${linked}   expected ${enabled}  ${linked === enabled ? "ok" : "MISMATCH"}`);
      console.log(`   /gate opens:    ${opens}   expected ${enabled}  ${opens === enabled ? "ok" : "MISMATCH"}`);
      console.log(`   card on form:   ${cardField}   expected ${enabled}  ${cardField === enabled ? "ok" : "MISMATCH"}`);
    }
  } finally {
    await setSetting(GATE_ENABLED_KEY, original);
    console.log(`\n(setting restored to ${original || "unset"})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
