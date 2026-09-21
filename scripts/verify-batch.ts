/**
 * Verification for the backup feature + this batch of changes.
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-batch.ts
 * (dev server must be up on :3000)
 */
import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { encryptSession } from "../lib/auth/session-crypto";
import {
  backupsDir,
  createBackup,
  listBackups,
  readBackup,
  restoreBackup,
  deleteBackup,
} from "../lib/backup";

const BASE = "http://localhost:3000";
let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!ok) failures++;
}

async function cookieFor(username: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { username } });
  const token = await encryptSession(
    { userId: u.id, role: u.role, username: u.username, displayName: u.displayName },
    new Date(Date.now() + 60 * 60 * 1000)
  );
  return `fitflow_session=${token}`;
}

async function get(pathname: string, cookie?: string, headers: Record<string, string> = {}) {
  return fetch(BASE + pathname, {
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    redirect: "manual",
  });
}

async function main() {
  // ── 1. Backup lib round-trip ────────────────────────────────────────────
  const membersBefore = await prisma.member.count();
  const paymentsBefore = await prisma.payment.findMany({ orderBy: { id: "asc" } });
  const snap = await createBackup();
  check("createBackup writes a file", (await stat(path.join(backupsDir(), snap.name))).size > 1000);
  check("counts.member matches DB", snap.counts?.member === membersBefore);

  const listed = await listBackups();
  check("listBackups includes new file", listed.some((b) => b.name === snap.name));

  // Mutate: add a throwaway member + delete a payment, then restore.
  const tmp = await prisma.member.create({
    data: { name: "TEMP RESTORE TEST", phone: "07000000000", age: 30, gender: "MALE" },
  });
  const victim = paymentsBefore[0];
  await prisma.payment.delete({ where: { id: victim.id } });
  check("mutation applied", (await prisma.member.count()) === membersBefore + 1);

  const file = await readBackup(snap.name);
  check("readBackup parses", !!file);
  const restored = await restoreBackup(file!);
  check("restore returns counts", restored.member === membersBefore);
  check("temp member gone after restore", (await prisma.member.findUnique({ where: { id: tmp.id } })) === null);
  const victimBack = await prisma.payment.findUnique({ where: { id: victim.id } });
  check("deleted payment is back", !!victimBack);
  check(
    "Decimal amount survives round-trip",
    victimBack?.amount.toString() === victim.amount.toString(),
    `${victimBack?.amount} vs ${victim.amount}`
  );
  check(
    "Date survives round-trip",
    victimBack?.createdAt.getTime() === victim.createdAt.getTime()
  );
  const paymentsAfter = await prisma.payment.count();
  check("payment count restored", paymentsAfter === paymentsBefore.length);
  const usersAfter = await prisma.user.count();
  check("users restored (>0)", usersAfter > 0);

  // ── 2. HTTP: page + download route auth ─────────────────────────────────
  const mgr = await cookieFor("manager");
  const rec = await cookieFor("reception");

  const page = await get("/backup", mgr);
  const html = await page.text();
  check("GET /backup as manager → 200", page.status === 200);
  check("backup page renders table row with file name", html.includes(snap.name));

  // requireRole() redirects inside the streamed RSC (shell already sent), so
  // the status is 200 with a NEXT_REDIRECT marker and no page UI — same as
  // every other manager-only page.
  const recPage = await get("/backup", rec);
  const recPageHtml = await recPage.text();
  check(
    "GET /backup as reception → redirected, no backup UI",
    (recPage.status === 307 || recPageHtml.includes("NEXT_REDIRECT")) &&
      !recPageHtml.includes("lucide-database-backup"),
    String(recPage.status)
  );

  const dl = await get(`/api/backup/${snap.name}`, mgr);
  check("download as manager → 200 json", dl.status === 200 && (dl.headers.get("content-type") ?? "").includes("json"));
  check("download has attachment disposition", (dl.headers.get("content-disposition") ?? "").includes("attachment"));
  const dlRec = await get(`/api/backup/${snap.name}`, rec);
  check("download as reception → 403", dlRec.status === 403);
  const dlAnon = await get(`/api/backup/${snap.name}`);
  check("download anonymous → 403", dlAnon.status === 403);
  const traversal = await get(`/api/backup/..%2F..%2F.env`, mgr);
  check("path traversal → 404", traversal.status === 404, String(traversal.status));
  const badName = await get(`/api/backup/package.json`, mgr);
  check("non-backup filename → 404", badName.status === 404);

  // ── 3. Nav has backup entry (rendered link) ─────────────────────────────
  check("sidebar has /backup link", html.includes('href="/backup"'));
  const recHome = await get("/members", rec);
  const recHtml = await recHome.text();
  check("reception sidebar has NO /backup link", !recHtml.includes('href="/backup"'));

  // ── 4. Other batch items ────────────────────────────────────────────────
  // Theme: light cookie removes the dark class.
  const light = await get("/members", mgr + "; fitflow_theme=light");
  const lightHtml = await light.text();
  check("theme=light → <html> without dark class", !/<html[^>]*class="[^"]*\bdark\b/.test(lightHtml));
  const dark = await get("/members", mgr);
  const darkHtml = await dark.text();
  check("default theme → <html> has dark class", /<html[^>]*class="[^"]*\bdark\b/.test(darkHtml));

  // Pagination: page 2 of members starts numbering at 26 (if enough members).
  const total = await prisma.member.count();
  if (total > 25) {
    const p2 = await get("/members?page=2", mgr);
    const p2Html = await p2.text();
    check("members page 2 renders", p2.status === 200 && p2Html.includes(">26<"));
  } else {
    console.log("skip  pagination (fewer than 26 members)");
  }

  // Accounts page lists managers + "you" badge.
  const acc = await get("/captains", mgr);
  const accHtml = await acc.text();
  check("accounts page lists manager row", acc.status === 200 && accHtml.includes("lucide-crown"));

  // Report PDF: manager ok, reception forbidden.
  const pdf = await get("/api/reports/pdf?mode=monthly", mgr);
  check("report PDF as manager → application/pdf", pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("pdf"));
  const pdfRec = await get("/api/reports/pdf?mode=monthly", rec);
  check("report PDF as reception → 403", pdfRec.status === 403, String(pdfRec.status));

  // Stream route rejects non-video fetches.
  const vid = await prisma.video.findFirst();
  if (vid) {
    const bad = await get(`/api/videos/stream/${vid.hiddenToken}`, mgr, { "sec-fetch-dest": "empty" });
    check("stream with sec-fetch-dest=empty → 403", bad.status === 403, String(bad.status));
    const cross = await get(`/api/videos/stream/${vid.hiddenToken}`, mgr, { "sec-fetch-dest": "video", "sec-fetch-site": "cross-site" });
    check("stream cross-site → 403", cross.status === 403, String(cross.status));
  }

  // Freeze history is shown inside the details dialog, so on the server side
  // we can only confirm the data reaches the client component's props.
  const frozen = await prisma.freezeRecord.findFirst({
    orderBy: { startedAt: "desc" },
    include: { subscription: { include: { member: true } } },
  });
  if (frozen) {
    const m = await get(`/members?q=${encodeURIComponent(frozen.subscription.member.phone)}`, mgr);
    const mHtml = await m.text();
    // Props are serialised inside a <script> string, so quotes are escaped.
    check(
      "members page passes freezes[] + frozenDaysTotal to the table",
      /\\"frozenDaysTotal\\":\d+/.test(mHtml) && mHtml.includes('\\"freezes\\":[{')
    );
  } else {
    console.log("skip  freeze history (no freeze records)");
  }

  // ── cleanup: remove the snapshots this run created (keep user's own) ────
  const now = Date.now();
  for (const n of await readdir(backupsDir())) {
    const s = await stat(path.join(backupsDir(), n));
    if (now - s.mtimeMs < 5 * 60 * 1000) await deleteBackup(n);
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
