/**
 * WhatsApp worker — sends course PDFs from the gym's own number.
 *
 * Runs as its own long-lived process on the gym computer, beside the gate
 * bridge:   npm run whatsapp
 *
 * The hosted app cannot keep WhatsApp's socket open, so it only queues rows
 * in WhatsAppOutbox. This worker watches that table, downloads each course
 * PDF from its public share link and sends it as a real attachment, then
 * writes the result back. Nothing connects *to* this machine: it only makes
 * outbound connections, so no public address or port forwarding is needed.
 *
 * Pair the number once by scanning the QR code this prints on first run.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { workerPrisma } from "../lib/worker-db";
import QRCode from "qrcode";
import * as wa from "../lib/whatsapp/client";
import { coursePdfFilename, type CourseKind } from "../lib/pdf/store";
import { buildCourseMessage, isWhatsAppEnabled } from "../lib/whatsapp/links";
import {
  WA_HEARTBEAT_KEY,
  WA_LINKED_AT_KEY,
  WA_NUMBER_KEY,
} from "../lib/whatsapp/worker-state";

const POLL_MS = Math.max(1000, Number(process.env.WHATSAPP_POLL_MS || 5000));
const HEARTBEAT_MS = 30_000;
/** Give up on a row after this many tries, so one bad number cannot spin. */
const MAX_ATTEMPTS = 3;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

const prisma = workerPrisma();
const stamp = () => new Date().toLocaleTimeString("en-GB");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setSetting(key: string, value: string) {
  await prisma.setting
    .upsert({ where: { key }, update: { value }, create: { key, value } })
    .catch((e) => console.error(`[${stamp()}] could not write ${key}:`, e.message));
}

/**
 * Pairing needs a QR code held in front of a phone, but this worker normally
 * runs as a Windows task with no console to print one into. So each code is
 * also written to disk as an image, next to a page that reloads it — open
 * that page once and it keeps showing the current code as WhatsApp rotates
 * it every few seconds. Both files are deleted the moment pairing succeeds,
 * since a live QR is a key to the gym's WhatsApp account.
 */
const PAIR_DIR = path.join(process.cwd(), "storage");
const PAIR_PNG = path.join(PAIR_DIR, "whatsapp-qr.png");
const PAIR_PAGE = path.join(PAIR_DIR, "whatsapp-pair.html");

const PAIR_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Link the gym's WhatsApp</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#14161a; color:#e8e8ea;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { text-align:center; padding:28px; }
  img { width:300px; height:300px; background:#fff; padding:12px; border-radius:12px; }
  h1 { font-size:18px; font-weight:600; margin:0 0 6px; }
  p { color:#9aa0a6; font-size:14px; margin:6px 0 18px; max-width:360px; }
  .hint { margin-top:18px; font-size:12px; color:#6b7280; }
</style>
</head>
<body>
  <div class="card">
    <h1>Link the gym's WhatsApp number</h1>
    <p>On the gym phone: WhatsApp → Settings → Linked devices → Link a device, then scan this.</p>
    <img id="qr" alt="QR code">
    <div class="hint">The code changes every few seconds — this page keeps up.
      It disappears once the number is linked.</div>
  </div>
<script>
  // Cache-busted so the browser fetches the freshly written file, not a copy.
  setInterval(() => {
    document.getElementById("qr").src = "whatsapp-qr.png?t=" + Date.now();
  }, 2000);
  document.getElementById("qr").src = "whatsapp-qr.png?t=" + Date.now();
</script>
</body>
</html>`;

async function publishQr(qr: string) {
  try {
    await mkdir(PAIR_DIR, { recursive: true });
    await QRCode.toFile(PAIR_PNG, qr, { width: 600, margin: 2 });
    await writeFile(PAIR_PAGE, PAIR_HTML, "utf8");
  } catch (e) {
    console.error(`[${stamp()}] could not write the QR image:`, (e as Error).message);
  }
}

async function clearQr() {
  await rm(PAIR_PNG, { force: true }).catch(() => {});
  await rm(PAIR_PAGE, { force: true }).catch(() => {});
}

if (!isWhatsAppEnabled()) {
  console.log("WhatsApp sending is off. Set WHATSAPP_ENABLED=true in .env to run the worker.");
  process.exit(0);
}
if (!APP_URL) {
  // No Vercel fallback here: this runs on the gym computer, so the public
  // address has to be stated explicitly.
  console.error(
    "NEXT_PUBLIC_APP_URL is not set — the worker needs the site's public address\n" +
      "to download course PDFs. Add it to .env, e.g.\n" +
      '  NEXT_PUBLIC_APP_URL="https://your-site.vercel.app"'
  );
  process.exit(1);
}

/** Fetch the course PDF from its public share link. */
async function fetchCoursePdf(shareToken: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`${APP_URL}/p/${shareToken}`, {
      headers: { "User-Agent": "FitFlow-WhatsApp-Worker" },
    });
    if (!res.ok) {
      console.log(`[${stamp()}] share link returned ${res.status}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.log(`[${stamp()}] could not fetch the PDF: ${(e as Error).message}`);
    return null;
  }
}

async function deliver(row: {
  id: string;
  kind: string;
  courseId: string;
  memberName: string;
  phone: string;
  shareToken: string;
  attempts: number;
}): Promise<void> {
  const kind = (row.kind === "nutrition" ? "nutrition" : "training") as CourseKind;
  const attempts = row.attempts + 1;

  const fail = async (error: string) => {
    const giveUp = attempts >= MAX_ATTEMPTS;
    await prisma.whatsAppOutbox.update({
      where: { id: row.id },
      data: { attempts, lastError: error, status: giveUp ? "FAILED" : "PENDING" },
    });
    console.log(
      `[${stamp()}] ${giveUp ? "FAILED" : "retry"}  ${row.memberName} +${row.phone}  ${error}`
    );
  };

  const pdf = await fetchCoursePdf(row.shareToken);
  if (!pdf) return fail("could not download the course PDF");

  const caption = buildCourseMessage(row.memberName, kind, `${APP_URL}/p/${row.shareToken}`);
  const res = await wa.sendDocument({
    to: row.phone,
    data: pdf,
    filename: coursePdfFilename(kind, row.memberName),
    caption,
  });

  if (!res.sent) {
    // An unreachable socket is not the row's fault — do not spend an attempt.
    if (res.reason === "not_connected") {
      console.log(`[${stamp()}] socket down, leaving ${row.memberName} queued`);
      return;
    }
    return fail(res.detail ? `${res.reason}: ${res.detail}` : res.reason);
  }

  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppOutbox.update({
      where: { id: row.id },
      data: { status: "SENT", attempts, sentAt, lastError: null },
    });
    const stampCols = { sentTo: row.phone, sentAt };
    // updateMany, not update: the course may have been deleted or expired
    // between queueing and sending, and that must not undo the send.
    if (kind === "training") {
      await tx.trainingCourse.updateMany({ where: { id: row.courseId }, data: stampCols });
    } else {
      await tx.nutritionCourse.updateMany({ where: { id: row.courseId }, data: stampCols });
    }
  });
  console.log(`[${stamp()}] SENT   ${row.memberName} +${row.phone}  (${pdf.length} bytes)`);
}

async function main() {
  console.log(`WhatsApp worker — polling every ${POLL_MS}ms, app at ${APP_URL}`);
  await prisma.$queryRaw`SELECT 1`;
  console.log(`[${stamp()}] FitFlow database OK`);

  wa.onQrCode(async (qr) => {
    await publishQr(qr);
    console.log("\nScan with the gym phone: WhatsApp → Settings → Linked devices");
    console.log(`Or open this page and scan from there:\n  ${PAIR_PAGE}\n`);
    console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
  });
  wa.onLink(async (me) => {
    await setSetting(WA_NUMBER_KEY, me ?? "");
    await setSetting(WA_LINKED_AT_KEY, me ? new Date().toISOString() : "");
    // A live QR is a key to the account — do not leave one lying on disk.
    await clearQr();
    console.log(me ? `[${stamp()}] linked as +${me}` : `[${stamp()}] number unlinked`);
  });

  if (!(await wa.hasCredentials())) {
    console.log(`[${stamp()}] no paired number yet — a QR code will appear shortly`);
  }
  void wa.connect();

  let lastBeat = 0;
  for (;;) {
    const now = Date.now();
    if (now - lastBeat > HEARTBEAT_MS) {
      lastBeat = now;
      await setSetting(WA_HEARTBEAT_KEY, new Date().toISOString());
    }

    // Nothing can go out until the phone is paired and the socket is up.
    if (!(await wa.ensureConnected(5_000))) {
      await sleep(POLL_MS);
      continue;
    }

    let queued;
    try {
      queued = await prisma.whatsAppOutbox.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 5,
      });
    } catch (e) {
      console.log(`[${stamp()}] database error: ${(e as Error).message}`);
      await sleep(POLL_MS);
      continue;
    }

    for (const row of queued) {
      try {
        await deliver(row);
      } catch (e) {
        console.error(`[${stamp()}] unexpected error on ${row.id}:`, e);
      }
      // WhatsApp bans numbers that burst; keep a human pace between messages.
      await sleep(1500);
    }

    await sleep(POLL_MS);
  }
}

main().catch(async (e) => {
  console.error("WhatsApp worker failed:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("\nstopping…");
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});
