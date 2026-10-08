import "server-only";
import { prisma } from "@/lib/prisma";
import {
  BACKUP_BUCKET,
  downloadFile,
  listFiles,
  removeFile,
  storageConfigured,
  uploadFile,
} from "@/lib/supabase/storage";

/**
 * Whole-database snapshots as a single JSON file in the Supabase `backups`
 * bucket (private — reachable only through the manager-only download route).
 *
 * Every table is dumped in full (Decimals as strings, Dates as ISO) and can be
 * written back verbatim — ids included — so nothing that references a row
 * (course share links, video tokens, session user ids) breaks after a
 * restore. Uploaded videos live in their own bucket and are not copied here:
 * they are large and already stored durably.
 */

export const BACKUP_FORMAT = 1;

/** Insert order respects foreign keys; deletion walks it backwards. */
const TABLES = [
  "setting",
  "rateLimit",
  "subscriptionPlan",
  "user",
  "member",
  "subscription",
  "payment",
  "freezeRecord",
  "video",
  "videoRating",
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
  "whatsAppOutbox",
] as const;

type TableName = (typeof TABLES)[number];

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

/**
 * Listing every snapshot would otherwise mean downloading each one just to
 * read its header, so the row counts are kept in one small manifest beside
 * them. It lives in the bucket rather than the database, which a restore
 * would overwrite.
 */
const MANIFEST = "index.json";

/** Only names we generate ourselves may be read back — no path games. */
function safeName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  return /^fitflow-\d{8}-\d{6}\.json$/.test(base) ? base : null;
}

async function readManifest(): Promise<BackupInfo[]> {
  const raw = await downloadFile(BACKUP_BUCKET, MANIFEST);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as { items?: BackupInfo[] };
    return parsed.items ?? [];
  } catch {
    return [];
  }
}

async function writeManifest(items: BackupInfo[]): Promise<void> {
  await uploadFile(
    BACKUP_BUCKET,
    MANIFEST,
    Buffer.from(JSON.stringify({ items }), "utf8"),
    "application/json"
  );
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

export function backupsConfigured(): boolean {
  return storageConfigured();
}

export async function createBackup(): Promise<BackupInfo> {
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
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  await uploadFile(BACKUP_BUCKET, name, bytes, "application/json");

  const info: BackupInfo = { name, size: bytes.length, createdAt: body.createdAt, counts };
  await writeManifest([info, ...(await readManifest()).filter((b) => b.name !== name)]);
  return info;
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (!storageConfigured()) return [];
  const [manifest, objects] = await Promise.all([
    readManifest(),
    listFiles(BACKUP_BUCKET),
  ]);
  const known = new Map(manifest.map((b) => [b.name, b]));

  // The bucket is the source of truth for what exists; the manifest only adds
  // the counts. A snapshot uploaded by hand still shows up, without them.
  return objects
    .filter((o) => safeName(o.name))
    .map((o) => {
      const m = known.get(o.name);
      return {
        name: o.name,
        size: o.size || m?.size || 0,
        createdAt: m?.createdAt ?? o.createdAt,
        counts: m?.counts ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackup(name: string): Promise<BackupFile | null> {
  const raw = await readBackupRaw(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as BackupFile;
    if (parsed.app !== "fitflow" || parsed.format !== BACKUP_FORMAT || !parsed.tables) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readBackupRaw(name: string): Promise<Buffer | null> {
  const safe = safeName(name);
  if (!safe) return null;
  return downloadFile(BACKUP_BUCKET, safe);
}

export async function deleteBackup(name: string): Promise<boolean> {
  const safe = safeName(name);
  if (!safe) return false;
  await removeFile(BACKUP_BUCKET, safe);
  await writeManifest((await readManifest()).filter((b) => b.name !== safe));
  return true;
}

/**
 * Replace the whole database with a snapshot, in one transaction so either
 * every table comes back or none does. Tables are emptied in reverse
 * dependency order and refilled in forward order, which keeps foreign keys
 * satisfied at every step without touching database-level settings.
 */
export async function restoreBackup(file: BackupFile): Promise<Record<TableName, number>> {
  const restored = {} as Record<TableName, number>;

  await prisma.$transaction(
    async (tx) => {
      for (const t of [...TABLES].reverse()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any)[t].deleteMany();
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
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  return restored;
}

/** Day (YYYYMMDD) for which this process already confirmed a snapshot exists. */
let dailyChecked = "";

/**
 * Write today's snapshot if none exists yet. Cheap to call on every manager
 * page load; only the first call of the day does any real work.
 */
export async function ensureDailyBackup(): Promise<void> {
  if (!storageConfigured()) return;
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `fitflow-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  if (dailyChecked === prefix) return;
  try {
    const existing = await listFiles(BACKUP_BUCKET);
    if (!existing.some((o) => o.name.startsWith(prefix))) await createBackup();
    dailyChecked = prefix;
  } catch (e) {
    console.error("daily backup failed", e);
  }
}
