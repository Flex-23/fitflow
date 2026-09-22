import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage — the app's file system.
 *
 * The hosted app runs as serverless functions whose disk is read-only and
 * thrown away between requests, so uploaded videos and database snapshots
 * live in Supabase buckets instead. Both buckets are private: nothing is
 * reachable without a signed URL this server issues.
 *
 * Uses the secret (service-role) key, so it must never be imported from a
 * client component.
 */

export const VIDEO_BUCKET = "videos";
export const BACKUP_BUCKET = "backups";

let client: SupabaseClient | null = null;

/** Null when Supabase Storage is not configured (e.g. a local-only setup). */
export function storageClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function storageConfigured(): boolean {
  return storageClient() !== null;
}

function need(): SupabaseClient {
  const c = storageClient();
  if (!c) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY."
    );
  }
  return c;
}

export async function uploadFile(
  bucket: string,
  path: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const { error } = await need()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload to ${bucket}/${path} failed: ${error.message}`);
}

export async function downloadFile(bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await need().storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Short-lived URL the browser can fetch directly. Used for video playback:
 * a 40 MB file cannot pass through a serverless function, which caps both
 * request and response bodies at 4.5 MB.
 */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number
): Promise<string | null> {
  const { data, error } = await need()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  return error || !data ? null : data.signedUrl;
}

/** Signed URL the browser can PUT a file to, bypassing the 4.5 MB limit. */
export async function signedUploadUrl(
  bucket: string,
  path: string
): Promise<{ url: string; token: string } | null> {
  const { data, error } = await need().storage.from(bucket).createSignedUploadUrl(path);
  return error || !data ? null : { url: data.signedUrl, token: data.token };
}

export async function removeFile(bucket: string, path: string): Promise<void> {
  const { error } = await need().storage.from(bucket).remove([path]);
  // A missing object is not an error worth surfacing — the goal was removal.
  if (error) console.error(`remove ${bucket}/${path} failed:`, error.message);
}

export type StoredObject = { name: string; size: number; createdAt: string };

export async function listFiles(bucket: string, prefix = ""): Promise<StoredObject[]> {
  const { data, error } = await need()
    .storage.from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return [];
  return data
    .filter((o) => o.id !== null)
    .map((o) => ({
      name: o.name,
      size: (o.metadata?.size as number) ?? 0,
      createdAt: o.created_at ?? new Date().toISOString(),
    }));
}

/** True when the object exists in the bucket. */
export async function fileExists(bucket: string, path: string): Promise<boolean> {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await need().storage.from(bucket).list(dir, { search: name, limit: 1 });
  return !!data?.some((o) => o.name === name);
}
