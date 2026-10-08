/**
 * Gate bridge — links the turnstile's ZKTeco C3 panel to FitFlow.
 *
 * Runs as its own long-lived process on the gym computer, next to the web
 * app:   npm run gate
 *
 * Hybrid mode (docs/gate-hybrid-mode.md): the panel keeps its own mirror of
 * "who is allowed", with each card's subscription end date as its validity,
 * so it opens the door by itself even if this process — or the gym PC — is
 * off. This process still runs whenever the PC is on: it keeps that mirror
 * in sync with the database (reconcile), logs every tap into GateLog, and
 * decides live the cases the panel's own memory cannot (a card assigned
 * seconds ago, a renewal not yet pushed, the panel's memory just wiped).
 *
 * Cards live only where a member qualifies them — a renewal, freeze or
 * cancellation reaches the panel within one reconcile cycle (or instantly,
 * on the dirty flag the web app sets); FitFlow stays the single source of
 * truth, the panel a cache.
 *
 * Configuration comes from .env (see .env.example, "Gate" section).
 */
import { workerPrisma } from "../lib/worker-db";
import { C3Panel, CARD_EVENTS, PANEL_DECIDED_EVENT, DEVICE_START_EVENT } from "../lib/gate/c3";
import { decideEntry } from "../lib/gate/decide";
import { reconcile, wipePanel, type ReconcileCounts } from "../lib/gate/sync";
import {
  GATE_HEARTBEAT_KEY,
  GATE_PANEL_OK_KEY,
  GATE_PANEL_USERS_KEY,
  GATE_WIPE_REQUESTED_KEY,
  GATE_DIRTY_KEY,
} from "../lib/gate/worker-state";

const HOST = process.env.GATE_PANEL_HOST || "192.168.1.201";
const PORT = Number(process.env.GATE_PANEL_PORT || 4370);
const PASSWORD = process.env.GATE_PANEL_PASSWORD || "";
const DOOR = Number(process.env.GATE_DOOR || 1);
// Door the "exit" button opens. Defaults to the entry door for gates with a
// single relay; set GATE_EXIT_DOOR once a separate exit relay is wired.
const EXIT_DOOR = Number(process.env.GATE_EXIT_DOOR || process.env.GATE_DOOR || 1);
const OPEN_SECONDS = Math.min(254, Math.max(1, Number(process.env.GATE_OPEN_SECONDS || 3)));
const POLL_MS = Math.max(100, Number(process.env.GATE_POLL_MS || 300));
const SYNC_INTERVAL_MS = Math.max(5_000, Number(process.env.GATE_SYNC_INTERVAL_MS || 60_000));
const TAKEOVER = process.env.GATE_PANEL_TAKEOVER === "true";
const TIMEZONE_ID = Number(process.env.GATE_TIMEZONE_ID || 1);
// Same-card debounce on top of the panel's own "too short interval" filter.
const DEBOUNCE_MS = 3000;
// The panel's clock drifts; validity is date-based on the panel, so keep it
// honest without syncing on every single connect churn.
const CLOCK_SYNC_MS = 24 * 60 * 60 * 1000;

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

async function getSetting(key: string): Promise<string> {
  return (await prisma.setting.findUnique({ where: { key } }).catch(() => null))?.value ?? "";
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

/**
 * Set the panel's clock — off by default. Verified live on the real panel
 * (2026-09-28): the DATETIME command (0x03) makes this exact C3-200 drop the
 * connection outright rather than reply, taking the socket down with it — so
 * calling it unconditionally would block every reconcile right after. Set
 * GATE_CLOCK_SYNC=true only once that is debugged (see
 * docs/gate-hybrid-mode.md §5.5); until then hybrid mode's dates are the
 * panel's own clock, unsynced, which is the same as today.
 */
async function syncClock(panel: C3Panel): Promise<void> {
  if (process.env.GATE_CLOCK_SYNC !== "true") return;
  try {
    await panel.setDateTime(new Date());
  } catch (e) {
    console.log(`[${stamp()}] clock sync skipped: ${(e as Error).message}`);
    if (!panel.connected) {
      // The panel dropped the link over this — reconnect now rather than
      // let every command after it fail with "not connected".
      throw e;
    }
  }
}

function logReconcile(counts: ReconcileCounts, reason: string) {
  console.log(
    `[${stamp()}] reconcile (${reason}): +${counts.added} ~${counts.updated} -${counts.removed}` +
      (counts.foreign ? `  ${counts.foreign} foreign row(s)${TAKEOVER ? " removed" : " left alone — set GATE_PANEL_TAKEOVER=true to clear them"}` : "")
  );
}

async function runReconcile(panel: C3Panel, reason: string): Promise<void> {
  const foreignCards: number[] = [];
  const counts = await reconcile(panel, prisma, {
    door: DOOR,
    timezoneId: TIMEZONE_ID,
    takeover: TAKEOVER,
    onForeign: (card) => foreignCards.push(card),
  });
  logReconcile(counts, reason);
  if (foreignCards.length && !TAKEOVER) {
    console.log(`[${stamp()}]   foreign card(s): ${foreignCards.join(", ")}`);
  }
  const total = await prisma.member.count({ where: { cardWiegand: { not: null } } });
  await setSetting(GATE_PANEL_USERS_KEY, String(Math.max(0, total - counts.foreign)));
}

/**
 * App-triggered opens — the experimental "open from the member's page" channel.
 *
 * Entirely separate from the panel's own card memory above: the web app has
 * already checked the member's subscription and daily limit, and only recorded
 * a short-lived GateCommand. Here we act on the pending ones and open the door.
 * The hybrid reconcile/decide path is not involved.
 */
async function processAppCommands(panel: C3Panel): Promise<void> {
  let cmds;
  try {
    cmds = await prisma.gateCommand.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
  } catch {
    return; // a hiccup here must never disturb the card path
  }
  if (!cmds.length) return;

  const now = Date.now();
  for (const cmd of cmds) {
    if (cmd.expiresAt.getTime() < now) {
      await prisma.gateCommand
        .update({ where: { id: cmd.id }, data: { status: "expired", consumedAt: new Date() } })
        .catch(() => {});
      continue;
    }
    const door = cmd.direction === "out" ? EXIT_DOOR : DOOR;
    try {
      await panel.openDoor(door, OPEN_SECONDS);
      await prisma.gateCommand
        .update({ where: { id: cmd.id }, data: { status: "done", consumedAt: new Date() } })
        .catch(() => {});
      await prisma.gateLog
        .create({
          data: { memberId: cmd.memberId, card: "app", door, allowed: true, reason: cmd.direction, source: "app" },
        })
        .catch(() => {});
      console.log(`[${stamp()}] APP OPEN  ${cmd.direction}  member ${cmd.memberId} → door ${door} ${OPEN_SECONDS}s`);
    } catch (e) {
      await prisma.gateCommand
        .update({ where: { id: cmd.id }, data: { status: "failed", consumedAt: new Date() } })
        .catch(() => {});
      console.log(`[${stamp()}] APP OPEN FAILED ${cmd.direction} member ${cmd.memberId}: ${(e as Error).message}`);
    }
  }
}

async function main() {
  console.log(
    `Gate bridge (hybrid) — door ${DOOR}, opens ${OPEN_SECONDS}s, polling every ${POLL_MS}ms, ` +
      `reconciling every ${Math.round(SYNC_INTERVAL_MS / 1000)}s`
  );
  await prisma.$queryRaw`SELECT 1`;
  console.log(`[${stamp()}] FitFlow database OK`);

  let panel = await connectPanel();
  await syncClock(panel);
  let lastClockSync = Date.now();
  try {
    await runReconcile(panel, "startup");
  } catch (e) {
    console.log(`[${stamp()}] initial reconcile failed: ${(e as Error).message}`);
  }
  let lastReconcile = Date.now();
  let lastSeenDirtyAt = await getSetting(GATE_DIRTY_KEY);

  const lastSeen = new Map<number, number>();
  let lastBeat = 0;

  for (;;) {
    if (!panel.connected) {
      panel = await connectPanel();
      await syncClock(panel);
      lastClockSync = Date.now();
      try {
        await runReconcile(panel, "reconnect");
        lastReconcile = Date.now();
      } catch (e) {
        console.log(`[${stamp()}] reconcile failed: ${(e as Error).message}`);
      }
    }

    // App-triggered opens first, every loop — before the heavier reconcile, so
    // a member's tap opens the door in a poll cycle rather than waiting on sync.
    if (panel.connected) await processAppCommands(panel);

    const now = Date.now();
    if (now - lastBeat > HEARTBEAT_MS) {
      lastBeat = now;
      const at = new Date().toISOString();
      await setSetting(GATE_HEARTBEAT_KEY, at);
      // Two separate facts: this process is alive, and the panel answers.
      await setSetting(GATE_PANEL_OK_KEY, at);
    }

    if (now - lastClockSync > CLOCK_SYNC_MS) {
      await syncClock(panel);
      lastClockSync = now;
    }

    // The manager asked to clear the panel's memory outright — do that, then
    // let the reconcile below rebuild it fresh from the database.
    const wipeRequested = (await getSetting(GATE_WIPE_REQUESTED_KEY)) === "true";
    if (wipeRequested) {
      try {
        const cleared = await wipePanel(panel);
        console.log(`[${stamp()}] panel memory wiped (${cleared} row(s)) — rebuilding`);
        await runReconcile(panel, "post-wipe");
        lastReconcile = Date.now();
      } catch (e) {
        console.log(`[${stamp()}] wipe failed: ${(e as Error).message}`);
      } finally {
        await setSetting(GATE_WIPE_REQUESTED_KEY, "false");
      }
    }

    // A renewal, freeze or cancellation at the desk marks the mirror stale;
    // pick that up before the periodic interval would.
    let dueForReconcile = now - lastReconcile > SYNC_INTERVAL_MS;
    if (!dueForReconcile) {
      const dirtyAt = await getSetting(GATE_DIRTY_KEY);
      if (dirtyAt && dirtyAt !== lastSeenDirtyAt) {
        lastSeenDirtyAt = dirtyAt;
        dueForReconcile = true;
      }
    }
    if (dueForReconcile) {
      try {
        await runReconcile(panel, "scheduled");
        lastReconcile = Date.now();
        lastSeenDirtyAt = await getSetting(GATE_DIRTY_KEY);
      } catch (e) {
        console.log(`[${stamp()}] reconcile failed: ${(e as Error).message}`);
      }
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

    let sawDeviceStart = false;
    for (const r of records) {
      if (r.kind !== "event") continue;

      if (r.type === DEVICE_START_EVENT) {
        sawDeviceStart = true;
        continue;
      }
      if (!r.card || !CARD_EVENTS.has(r.type)) {
        if (r.card) console.log(`[${stamp()}] card ${r.card} door ${r.door}: ${r.typeName} — ignored`);
        continue;
      }

      // The panel already opened this one from its own memory — log only.
      if (r.type === PANEL_DECIDED_EVENT) {
        console.log(`[${stamp()}] card ${r.card}: opened by panel (synced)`);
        prisma.gateLog
          .create({ data: { card: String(r.card), door: r.door, allowed: true, source: "panel" } })
          .catch((e) => console.log(`[${stamp()}] gate log write failed: ${e.message}`));
        continue;
      }

      const t = Date.now();
      if (t - (lastSeen.get(r.card) ?? 0) < DEBOUNCE_MS) continue;
      lastSeen.set(r.card, t);

      // The panel could not decide by itself (unregistered / its own
      // validity lapsed / authorization row missing) — FitFlow decides live.
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
        console.log(
          `[${stamp()}] ALLOW  card ${r.card}  ${who}  ${decision.detail}  (${r.typeName})  → ${opened}  (${Date.now() - t}ms)`
        );
        // The panel's own memory disagreed with the database — fix it now
        // rather than waiting for the next scheduled reconcile.
        lastReconcile = 0; // forces a reconcile at the top of the next loop
      } else {
        console.log(`[${stamp()}] DENY   card ${r.card}  ${who}  ${decision.reason}  (${r.typeName})  (${Date.now() - t}ms)`);
      }

      prisma.gateLog
        .create({
          data: {
            memberId: decision.member?.id ?? null,
            card: String(r.card),
            door: r.door,
            allowed: decision.allow,
            reason: decision.allow ? null : decision.reason,
            source: "bridge",
          },
        })
        .catch((e) => console.log(`[${stamp()}] gate log write failed: ${e.message}`));
    }

    if (sawDeviceStart) {
      console.log(`[${stamp()}] panel reported a restart — forcing a full reconcile`);
      lastReconcile = 0;
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
