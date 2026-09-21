/**
 * Gate bridge — links the turnstile's ZKTeco C3 panel to FitFlow.
 *
 * Runs as its own long-lived process on the gym computer, next to the web
 * app:   npm run gate
 *
 * Loop: poll the panel's realtime log → on a card read, look the card up in
 * FitFlow → let the member in when they hold a running subscription → record
 * the decision in GateLog (shown on the /gate page).
 *
 * Cards are never registered on the panel itself, so the panel refuses
 * everything on its own and FitFlow stays the single source of truth; a
 * renewal, freeze or cancellation takes effect at the door immediately.
 *
 * Configuration comes from .env (see .env.example, "Gate" section).
 */
import { PrismaClient } from "@prisma/client";
import { C3Panel, CARD_EVENTS } from "../lib/gate/c3";
import { decideEntry } from "../lib/gate/decide";

const HOST = process.env.GATE_PANEL_HOST || "192.168.1.201";
const PORT = Number(process.env.GATE_PANEL_PORT || 4370);
const PASSWORD = process.env.GATE_PANEL_PASSWORD || "";
const DOOR = Number(process.env.GATE_DOOR || 1);
const OPEN_SECONDS = Math.min(254, Math.max(1, Number(process.env.GATE_OPEN_SECONDS || 3)));
const POLL_MS = Math.max(100, Number(process.env.GATE_POLL_MS || 300));
// Same-card debounce on top of the panel's own "too short interval" filter.
const DEBOUNCE_MS = 3000;

const prisma = new PrismaClient();
const stamp = () => new Date().toLocaleTimeString("en-GB");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (process.env.GATE_ENABLED !== "true") {
  console.log("Gate bridge is off. Set GATE_ENABLED=true in .env to run it.");
  process.exit(0);
}

async function connectPanel(): Promise<C3Panel> {
  for (;;) {
    const panel = new C3Panel(HOST, PORT, PASSWORD);
    panel.onClose = (reason) => console.log(`[${stamp()}] panel link lost: ${reason}`);
    try {
      await panel.connect();
      const p = await panel.getParams(["~DeviceName", "~SerialNumber", "LockCount"]);
      console.log(
        `[${stamp()}] panel connected: ${p["~DeviceName"] ?? "?"} SN ${p["~SerialNumber"] ?? "?"} (${p.LockCount ?? "?"} doors) at ${HOST}:${PORT}`
      );
      return panel;
    } catch (e) {
      console.log(`[${stamp()}] panel connect failed: ${(e as Error).message} — retrying in 2s`);
      await panel.close();
      await sleep(2000);
    }
  }
}

async function main() {
  console.log(`Gate bridge — door ${DOOR}, opens ${OPEN_SECONDS}s, polling every ${POLL_MS}ms`);
  await prisma.$queryRaw`SELECT 1`;
  console.log(`[${stamp()}] FitFlow database OK`);

  let panel = await connectPanel();
  const lastSeen = new Map<number, number>();

  for (;;) {
    if (!panel.connected) panel = await connectPanel();

    let records;
    try {
      records = await panel.realtimeLog();
    } catch (e) {
      if (panel.connected) {
        console.log(`[${stamp()}] poll error: ${(e as Error).message}`);
        await sleep(1000);
      }
      continue;
    }

    for (const r of records) {
      if (r.kind !== "event" || !r.card) continue;
      if (!CARD_EVENTS.has(r.type)) {
        console.log(`[${stamp()}] card ${r.card} door ${r.door}: ${r.typeName} — ignored`);
        continue;
      }
      const t = Date.now();
      if (t - (lastSeen.get(r.card) ?? 0) < DEBOUNCE_MS) continue;
      lastSeen.set(r.card, t);

      let decision;
      try {
        decision = await decideEntry(prisma, r.card);
      } catch (e) {
        console.log(`[${stamp()}] card ${r.card}: database error — ${(e as Error).message}`);
        continue;
      }

      const who = decision.member ? `${decision.member.name} (${decision.member.phone})` : "—";
      let opened = "";
      if (decision.allow) {
        try {
          await panel.openDoor(DOOR, OPEN_SECONDS);
          opened = `door ${DOOR} open ${OPEN_SECONDS}s`;
        } catch (e) {
          opened = `OPEN FAILED: ${(e as Error).message}`;
        }
        console.log(`[${stamp()}] ALLOW  card ${r.card}  ${who}  ${decision.detail}  → ${opened}  (${Date.now() - t}ms)`);
      } else {
        console.log(`[${stamp()}] DENY   card ${r.card}  ${who}  ${decision.reason}  (${Date.now() - t}ms)`);
      }

      // The log is what the reception sees on /gate; never let a write
      // failure stop the door from working.
      prisma.gateLog
        .create({
          data: {
            memberId: decision.member?.id ?? null,
            card: String(r.card),
            door: r.door,
            allowed: decision.allow,
            reason: decision.allow ? null : decision.reason,
          },
        })
        .catch((e) => console.log(`[${stamp()}] gate log write failed: ${e.message}`));
    }

    await sleep(POLL_MS);
  }
}

main().catch(async (e) => {
  console.error("Gate bridge failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("\nstopping…");
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});
