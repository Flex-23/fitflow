/**
 * Gate self-test — proves the whole chain works before trusting the turnstile.
 *
 *   npm run gate:check            check everything, open nothing
 *   npm run gate:check -- --open  also pulse the door relay (it will turn!)
 *
 * Walks the same path a real card tap takes: this computer → the C3 panel on
 * the local network, and this computer → the hosted database. Each step is
 * timed, so a slow gate can be traced to the side that is actually slow.
 */
import net from "node:net";
import { workerPrisma } from "../lib/worker-db";
import { C3Panel } from "../lib/gate/c3";
import { decideEntry } from "../lib/gate/decide";

const HOST = process.env.GATE_PANEL_HOST || "192.168.1.201";
const PORT = Number(process.env.GATE_PANEL_PORT || 4370);
const PASSWORD = process.env.GATE_PANEL_PASSWORD || "";
const DOOR = Number(process.env.GATE_DOOR || 1);
const OPEN_SECONDS = Math.min(254, Math.max(1, Number(process.env.GATE_OPEN_SECONDS || 3)));
const OPEN = process.argv.includes("--open");

let failed = 0;
const pass = (label: string, detail = "") => console.log(`  OK    ${label}${detail ? "  — " + detail : ""}`);
const fail = (label: string, detail: string) => {
  failed++;
  console.log(`  FAIL  ${label}  — ${detail}`);
};
const info = (label: string, detail: string) => console.log(`        ${label}  ${detail}`);

/** Plain TCP reachability, so a dead cable is not reported as a protocol fault. */
function tcpProbe(host: string, port: number, ms = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const t = Date.now();
    const s = net.createConnection({ host, port });
    s.setTimeout(ms);
    s.on("connect", () => { s.destroy(); resolve(Date.now() - t); });
    s.on("timeout", () => { s.destroy(); resolve(null); });
    s.on("error", () => resolve(null));
  });
}

async function checkDatabase() {
  console.log("\nDatabase (the decision maker)");
  const prisma = workerPrisma();
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    pass("connected", `${Date.now() - t0}ms to open`);

    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      times.push(Date.now() - t);
    }
    times.sort((a, b) => a - b);
    const median = times[2];
    if (median < 250) pass("query latency", `median ${median}ms`);
    else fail("query latency", `median ${median}ms — every card tap pays this; use a nearer region`);

    const [members, withCards] = await Promise.all([
      prisma.member.count(),
      prisma.member.count({ where: { cardWiegand: { not: null } } }),
    ]);
    if (withCards > 0) pass("members with an access card", `${withCards} of ${members}`);
    else fail("members with an access card", `none of ${members} — assign cards on the members page`);

    // Time the real decision, not a toy query.
    const sample = await prisma.member.findFirst({
      where: { cardWiegand: { not: null } },
      select: { cardWiegand: true, name: true },
    });
    if (sample?.cardWiegand != null) {
      const t = Date.now();
      const d = await decideEntry(prisma, sample.cardWiegand);
      const ms = Date.now() - t;
      pass("decision round-trip", `${ms}ms for ${sample.name} → ${d.allow ? "ALLOW" : "DENY (" + d.reason + ")"}`);
    }
    return prisma;
  } catch (e) {
    fail("connected", (e as Error).message.split("\n")[0]);
    return prisma;
  }
}

async function checkPanel() {
  console.log(`\nPanel (the turnstile) at ${HOST}:${PORT}`);
  const rtt = await tcpProbe(HOST, PORT);
  if (rtt === null) {
    fail("reachable", "no answer — check power, the network cable, and that the panel's IP is on this subnet");
    return null;
  }
  pass("reachable", `${rtt}ms`);

  const panel = new C3Panel(HOST, PORT, PASSWORD);
  try {
    await panel.connect();
    pass("protocol handshake");
    const p = await panel.getParams(["~DeviceName", "~SerialNumber", "FirmVer", "LockCount", "IPAddress"]);
    info("device", `${p["~DeviceName"] ?? "?"}  SN ${p["~SerialNumber"] ?? "?"}  ${p.FirmVer ?? ""}`);
    info("doors", `${p.LockCount ?? "?"}    configured GATE_DOOR=${DOOR}`);

    const records = await panel.realtimeLog();
    pass("realtime log readable", `${records.length} record(s) waiting`);
    for (const r of records) {
      if (r.kind === "event") info("recent tap", `card ${r.card} on door ${r.door} — ${r.typeName}`);
    }

    if (OPEN) {
      await panel.openDoor(DOOR, OPEN_SECONDS);
      pass("door opened", `door ${DOOR} for ${OPEN_SECONDS}s — it should be turning now`);
    } else {
      info("door", "not opened (pass --open to test the relay)");
    }
    return panel;
  } catch (e) {
    fail("protocol handshake", (e as Error).message);
    return panel;
  }
}

async function main() {
  console.log("FitFlow gate self-test");
  if (process.env.GATE_ENABLED !== "true") {
    info("note", "GATE_ENABLED is not \"true\" — `npm run gate` would refuse to start");
  }

  const prisma = await checkDatabase();
  const panel = await checkPanel();

  await panel?.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});

  console.log(
    failed === 0
      ? "\nAll checks passed — the gate is ready to run with `npm run gate`."
      : `\n${failed} check(s) failed — fix those before relying on the turnstile.`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSelf-test crashed:", e);
  process.exit(1);
});
