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
import { workerPrisma } from "../lib/worker-db";
import { C3Panel, CARD_EVENTS } from "../lib/gate/c3";
import { decideEntry } from "../lib/gate/decide";
import { GATE_HEARTBEAT_KEY, GATE_PANEL_OK_KEY } from "../lib/gate/worker-state";

const HOST = process.env.GATE_PANEL_HOST || "192.168.1.201";
const PORT = Number(process.env.GATE_PANEL_PORT || 4370);
const PASSWORD = process.env.GATE_PANEL_PASSWORD || "";
const DOOR = Number(process.env.GATE_DOOR || 1);
const OPEN_SECONDS = Math.min(254, Math.max(1, Number(process.env.GATE_OPEN_SECONDS || 3)));
const POLL_MS = Math.max(100, Number(process.env.GATE_POLL_MS || 300));
// Same-card debounce on top of the panel's own "too short interval" filter.
const DEBOUNCE_MS = 3000;

const prisma = workerPrisma();
const stamp = () => new Date().toLocaleTimeString("en-GB");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (process.env.GATE_ENABLED !== "true") {
  console.log("Gate bridge is off. Set GATE_ENABLED=true in .env to run it.");
  process.exit(0);
}

/**
 * A panel that is unplugged must cost the gym nothing but the door.
 *
 * Whatever the network, the hardware or the driver throws, this process keeps
 * its loop and keeps reporting in — so the desk sees "gate offline" rather
 * than a bridge that quietly died, and the moment the panel answers again
 * everything carries on as before.
 */
process.on("unhandledRejection", (e) => {
  console.log(`[${stamp()}] unhandled rejection: ${e instanceof Error ? e.message : e}`);
});
process.on("uncaughtException", (e) => {
  console.log(`[${stamp()}] uncaught: ${e instanceof Error ? e.message : e}`);
});

const HEARTBEAT_MS = 20_000;

async function setSetting(key: string, value: string) {
  await prisma.setting
    .upsert({ where: { key }, update: { value }, create: { key, value } })
    .catch(() => {
      // The door does not depend on this; a lost heartbeat only makes the
      // /gate page say "stopped" a minute early.
    });
}

/**
 * Reconnect with a growing delay.
 *
 * The panel accepts a single client and, after dropping one, refuses new
 * connections for a spell while it frees the slot. Hammering it every couple
 * of seconds keeps it busy refusing and floods the log; backing off lets it
 * recover and makes the log readable. Capped so a gate that comes back is
 * picked up quickly.
 */
const RETRY_START_MS = 1_000;
const RETRY_MAX_MS = 15_000;

async function connectPanel(): Promise<C3Panel> {
  let delay = RETRY_START_MS;
  let attempt = 0;
  for (;;) {
    const panel = new C3Panel(HOST, PORT, PASSWORD);
    // Only a link that was actually up can be lost. The retry below closes
    // each failed attempt itself, and reporting those as losses buried the
    // log under thousands of lines about a connection that never existed.
    let wasUp = false;
    panel.onClose = (reason) => {
      if (wasUp) console.log(`[${stamp()}] panel link lost: ${reason}`);
    };
    try {
      await panel.connect();
      wasUp = true;
      const p = await panel.getParams(["~DeviceName", "~SerialNumber", "LockCount"]);
      console.log(
        `[${stamp()}] panel connected: ${p["~DeviceName"] ?? "?"} SN ${p["~SerialNumber"] ?? "?"} (${p.LockCount ?? "?"} doors) at ${HOST}:${PORT}` +
          (attempt ? `  (after ${attempt} failed attempt${attempt > 1 ? "s" : ""})` : "")
      );
      return panel;
    } catch (e) {
      attempt++;
      // Keep reporting in while the panel is away: a bridge that is waiting
      // and a bridge that has stopped look identical from the website
      // otherwise.
      await setSetting(GATE_HEARTBEAT_KEY, new Date().toISOString());
      // Only the first failure and every tenth after it are worth a line;
      // the rest are the same message repeating while the panel is away.
      if (attempt === 1 || attempt % 10 === 0) {
        console.log(
          `[${stamp()}] panel unreachable (attempt ${attempt}): ${(e as Error).message} — retrying every ${Math.round(delay / 1000)}s`
        );
      }
      await panel.close();
      await sleep(delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }
  }
}

async function main() {
  console.log(`Gate bridge — door ${DOOR}, opens ${OPEN_SECONDS}s, polling every ${POLL_MS}ms`);
  await prisma.$queryRaw`SELECT 1`;
  console.log(`[${stamp()}] FitFlow database OK`);

  let panel = await connectPanel();
  const lastSeen = new Map<number, number>();
  let lastBeat = 0;

  for (;;) {
    if (!panel.connected) panel = await connectPanel();

    const now = Date.now();
    if (now - lastBeat > HEARTBEAT_MS) {
      lastBeat = now;
      const at = new Date().toISOString();
      await setSetting(GATE_HEARTBEAT_KEY, at);
      // Two separate facts: this process is alive, and the panel answers.
      await setSetting(GATE_PANEL_OK_KEY, at);
    }

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

// Restart the loop rather than the process: the panel being away is the
// normal state of a gate whose cable is out, and it must not end the bridge.
async function forever() {
  for (;;) {
    try {
      await main();
    } catch (e) {
      console.log(`[${stamp()}] bridge error, restarting in 5s: ${(e as Error).message}`);
      await sleep(5000);
    }
  }
}

forever().catch(async (e) => {
  console.error("Gate bridge failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("\nstopping…");
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});
