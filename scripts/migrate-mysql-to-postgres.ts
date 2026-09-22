/**
 * One-off data move: local MySQL (XAMPP) → Supabase Postgres.
 *
 *   npm run migrate-mysql
 *
 * Reads every table from the old database and writes it to the new one with
 * ids intact, so course share links, video tokens and session user ids keep
 * working. Rows are inserted in foreign-key order and the target must already
 * have the schema (`prisma migrate deploy`).
 *
 * Safe to re-run: it refuses to start unless the target is empty, so a second
 * run cannot duplicate or half-overwrite anything. Pass --force to wipe the
 * target first.
 *
 * MYSQL_URL defaults to the old local database; set it if yours differs.
 */
import { PrismaClient } from "@prisma/client";

const MYSQL_URL = process.env.MYSQL_URL || "mysql://root:@localhost:3306/fitflow";
const FORCE = process.argv.includes("--force");

/** Insert order respects foreign keys; deletion walks it backwards. */
const TABLES = [
  "setting",
  "subscriptionPlan",
  "user",
  "member",
  "subscription",
  "payment",
  "freezeRecord",
  "video",
  "trainingCourse",
  "courseDay",
  "exercise",
  "nutritionCourse",
  "nutritionDay",
  "nutritionMeal",
  "mealSuggestion",
  "activityLog",
  "notification",
  "expense",
  "debt",
  "debtPayment",
  "gateLog",
] as const;

// The old client still speaks MySQL; the generated one speaks Postgres. Only
// the connection string differs, because both were generated from the same
// model names.
const source = new PrismaClient({ datasources: { db: { url: MYSQL_URL } } });
const target = new PrismaClient();

/* eslint-disable @typescript-eslint/no-explicit-any */
const from = (t: string) => (source as any)[t];
const to = (t: string) => (target as any)[t];

async function main() {
  console.log(`Source: ${MYSQL_URL.replace(/:[^:@]*@/, ":***@")}`);
  console.log(`Target: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@]*@/, ":***@")}\n`);

  await source.$queryRaw`SELECT 1`;
  await target.$queryRaw`SELECT 1`;

  // Never write into a database that already holds data unless asked.
  let existing = 0;
  for (const t of TABLES) existing += await to(t).count();
  if (existing > 0) {
    if (!FORCE) {
      console.error(
        `The target already holds ${existing} rows. Re-run with --force to wipe it first.`
      );
      process.exit(1);
    }
    console.log(`Wiping ${existing} rows from the target…`);
    for (const t of [...TABLES].reverse()) await to(t).deleteMany();
  }

  let moved = 0;
  for (const t of TABLES) {
    const rows = await from(t).findMany();
    if (rows.length === 0) {
      console.log(`${t.padEnd(18)} —`);
      continue;
    }
    // Chunked so one statement never grows unreasonably large.
    for (let i = 0; i < rows.length; i += 200) {
      await to(t).createMany({ data: rows.slice(i, i + 200) });
    }
    const check = await to(t).count();
    console.log(`${t.padEnd(18)} ${rows.length} → ${check}${check === rows.length ? "" : "  MISMATCH"}`);
    moved += rows.length;
  }

  console.log(`\nMoved ${moved} rows.`);
}

main()
  .then(async () => {
    await source.$disconnect();
    await target.$disconnect();
  })
  .catch(async (e) => {
    console.error("\nMigration failed:", e instanceof Error ? e.message : e);
    await source.$disconnect().catch(() => {});
    await target.$disconnect().catch(() => {});
    process.exit(1);
  });
