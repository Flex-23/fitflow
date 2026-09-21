import "server-only";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Whole-database snapshots as a single JSON file under storage/backups/.
 *
 * Every table is dumped in full (Decimals as strings, Dates as ISO) and can be
 * written back verbatim — ids included — so nothing that references a row
 * (course share links, video tokens, session user ids) breaks after a
 * restore. Uploaded videos and generated PDFs live next to this folder and
 * are copied separately: they are large and already sit on disk.
 */

export const BACKUP_FORMAT = 1;

/** Insert order respects foreign keys; restore also disables FK checks. */
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

type TableName = (typeof TABLES)[number];

/** MySQL table names as Prisma created them (used when truncating). */
const SQL_TABLE: Record<TableName, string> = {
  setting: "Setting",
  subscriptionPlan: "SubscriptionPlan",
  user: "User",
  member: "Member",
  subscription: "Subscription",
  payment: "Payment",
  freezeRecord: "FreezeRecord",
  video: "Video",
  trainingCourse: "TrainingCourse",
  courseDay: "CourseDay",
  exercise: "Exercise",
  nutritionCourse: "NutritionCourse",
  nutritionDay: "NutritionDay",
  nutritionMeal: "NutritionMeal",
  mealSuggestion: "MealSuggestion",
  activityLog: "ActivityLog",
  notification: "Notification",
  expense: "Expense",
  debt: "Debt",
  debtPayment: "DebtPayment",
  gateLog: "GateLog",
};

export type BackupFile = {
  format: number;
  createdAt: string;
  app: "fitflow";
  counts: Record<TableName, number>;
  tables: Record<TableName, Record<string, unknown>[]>;
};

export type BackupInfo = {
  name: string;
  size: number;
  createdAt: string;
  counts: Partial<Record<TableName, number>> | null;
};

export function backupsDir(): string {
  return process.env.BACKUP_DIR || "./storage/backups";
}

/** Only files we wrote ourselves may be read back — no path games. */
function safeName(name: string): string | null {
  const base = path.basename(name);
  return /^fitflow-\d{8}-\d{6}\.json$/.test(base) ? base : null;
}

function filePath(name: string): string | null {
  const safe = safeName(name);
  return safe ? path.join(backupsDir(), safe) : null;
}

/**
 * Convert Prisma rows to plain JSON-safe objects. Decimal and Date both carry
 * their own toJSON (string / ISO), and Prisma accepts those back on create.
 */
function plain(rows: unknown[]): Record<string, unknown>[] {
  return JSON.parse(JSON.stringify(rows));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = (t: TableName) => (prisma as any)[t];

export async function createBackup(): Promise<BackupInfo> {
  await mkdir(backupsDir(), { recursive: true });

  const tables = {} as BackupFile["tables"];
  const counts = {} as BackupFile["counts"];
  for (const t of TABLES) {
    const rows = await model(t).findMany();
    tables[t] = plain(rows);
    counts[t] = rows.length;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name =
    `fitflow-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;

  const body: BackupFile = {
    format: BACKUP_FORMAT,
    createdAt: now.toISOString(),
    app: "fitflow",
    counts,
    tables,
  };
  const target = path.join(backupsDir(), name);
  await writeFile(target, JSON.stringify(body), "utf8");
  const info = await stat(target);
  return { name, size: info.size, createdAt: body.createdAt, counts };
}

export async function listBackups(): Promise<BackupInfo[]> {
  await mkdir(backupsDir(), { recursive: true });
  const names = (await readdir(backupsDir())).filter((n) => safeName(n));
  const out: BackupInfo[] = [];
  for (const name of names) {
    const full = path.join(backupsDir(), name);
    const info = await stat(full);
    let counts: BackupInfo["counts"] = null;
    let createdAt = info.mtime.toISOString();
    try {
      // Only the header is needed; parse lazily but cheaply for small files.
      const parsed = JSON.parse(await readFile(full, "utf8")) as BackupFile;
      counts = parsed.counts;
      createdAt = parsed.createdAt;
    } catch {
      // Unreadable file: still listed, but flagged without counts.
    }
    out.push({ name, size: info.size, createdAt, counts });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackup(name: string): Promise<BackupFile | null> {
  const full = filePath(name);
  if (!full) return null;
  try {
    const parsed = JSON.parse(await readFile(full, "utf8")) as BackupFile;
    if (parsed.app !== "fitflow" || parsed.format !== BACKUP_FORMAT || !parsed.tables) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readBackupRaw(name: string): Promise<Buffer | null> {
  const full = filePath(name);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

export async function deleteBackup(name: string): Promise<boolean> {
  const full = filePath(name);
  if (!full) return false;
  try {
    await unlink(full);
    return true;
  } catch {
    return false;
  }
}

/**
 * Replace the whole database with a snapshot. Runs in one transaction with
 * foreign-key checks off, so either every table comes back or none does.
 */
export async function restoreBackup(file: BackupFile): Promise<Record<TableName, number>> {
  const restored = {} as Record<TableName, number>;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const t of [...TABLES].reverse()) {
          await tx.$executeRawUnsafe(`DELETE FROM \`${SQL_TABLE[t]}\``);
        }
        for (const t of TABLES) {
          const rows = file.tables[t] ?? [];
          restored[t] = rows.length;
          // createMany in chunks keeps each statement a sane size.
          for (let i = 0; i < rows.length; i += 500) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (tx as any)[t].createMany({ data: rows.slice(i, i + 500) });
          }
        }
      } finally {
        await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
      }
    },
    { timeout: 120_000 }
  );

  return restored;
}

/** Day (YYYYMMDD) for which this process already confirmed a snapshot exists. */
let dailyChecked = "";

/**
 * Write today's snapshot if none exists yet. Cheap to call on every manager
 * page load; only the first call of the day touches the disk.
 */
export async function ensureDailyBackup(): Promise<void> {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `fitflow-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  if (dailyChecked === prefix) return;
  try {
    await mkdir(backupsDir(), { recursive: true });
    const names = await readdir(backupsDir());
    if (!names.some((n) => n.startsWith(prefix))) await createBackup();
    dailyChecked = prefix;
  } catch (e) {
    console.error("daily backup failed", e);
  }
}
