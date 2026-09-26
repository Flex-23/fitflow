/**
 * Which roles each person may hand out, and where a bare /me goes.
 *
 *   npm run check:roles
 *
 * The first is the rule that stops a limit being walked around: a manager
 * who cannot open reception must not be able to create a reception login,
 * because that login can do everything reception can. The second is the
 * member page answering someone who has no business on it.
 */
import { prisma } from "../lib/prisma";
import { assignableRoles } from "../lib/auth/rbac";
import type { Role, Section } from "@prisma/client";

const BASE = process.env.CHECK_BASE_URL || "http://localhost:3000";

const CASES: [string, Role, Section[], Role[]][] = [
  ["master", "MASTER", [], ["MANAGER", "RECEPTION", "CAPTAIN"]],
  ["manager, everything", "MANAGER", ["RECEPTION", "COACHING", "STAFF"], ["RECEPTION", "CAPTAIN"]],
  ["manager, desk only", "MANAGER", ["RECEPTION", "STAFF"], ["RECEPTION"]],
  ["manager, coaching only", "MANAGER", ["COACHING", "STAFF"], ["CAPTAIN"]],
  ["manager, money only", "MANAGER", ["FINANCE", "STAFF"], []],
  // Neither holds the staff section, so neither hands out anything.
  ["reception", "RECEPTION", [], []],
  ["captain", "CAPTAIN", [], []],
  // A manager with the sections but not the staff screen is the same.
  ["manager, no staff section", "MANAGER", ["RECEPTION", "COACHING"], []],
];

async function main() {
  let wrong = 0;

  console.log("who may hand out which role\n");
  for (const [label, role, sections, expected] of CASES) {
    const got = assignableRoles({ role, sections, canAddVideos: false });
    const same =
      got.length === expected.length && expected.every((r) => got.includes(r));
    if (!same) wrong++;
    console.log(
      `  ${label.padEnd(24)} ${(got.join(", ") || "—").padEnd(30)} ${same ? "ok" : `MISMATCH, expected ${expected.join(", ") || "—"}`}`
    );
  }

  console.log("\nwhere /me sends someone with no session\n");
  const cases: [string, string][] = [
    ["a bare /me", "/me"],
    ["after a dead link", "/me?e=expired"],
    ["after too many tries", "/me?e=locked"],
  ];
  for (const [label, path] of cases) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    const body = res.status === 200 ? await res.text() : "";
    // A guard that fires mid-stream answers 200 and puts the redirect in the
    // body, so the marker is the signal and the status code is not.
    const sentAway = res.status !== 200 || /NEXT_REDIRECT/.test(body);
    const wantAway = path === "/me";
    if (sentAway !== wantAway) wrong++;
    console.log(
      `  ${label.padEnd(24)} ${sentAway ? "to the sign-in page" : "shows an explanation"}  ${sentAway === wantAway ? "ok" : "MISMATCH"}`
    );
  }

  console.log(wrong === 0 ? "\nAll as expected." : `\n${wrong} wrong.`);
  process.exitCode = wrong === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
