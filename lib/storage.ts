import "server-only";
import {
  VIDEO_BUCKET,
  fileExists,
  removeFile,
  signedUploadUrl,
  signedUrl,
} from "@/lib/supabase/storage";

/**
 * Exercise videos live in the private Supabase `videos` bucket.
 *
 * They never pass through the app server: a serverless function caps both
 * request and response bodies at 4.5 MB, well under the 40 MB a clip may
 * reach. The browser uploads straight to Supabase with a signed URL this
 * server issues, and plays back from a short-lived signed URL the same way.
 */

/** How long a playback URL stays valid. Long enough to watch, short enough
 *  that a copied link is worthless soon after. */
export const PLAYBACK_URL_TTL_SECONDS = 2 * 60;

export async function createUploadUrl(
  storedFilename: string
): Promise<{ url: string; token: string } | null> {
  return signedUploadUrl(VIDEO_BUCKET, storedFilename);
}

export async function playbackUrl(storedFilename: string): Promise<string | null> {
  return signedUrl(VIDEO_BUCKET, storedFilename, PLAYBACK_URL_TTL_SECONDS);
}

/** Confirms the browser really finished its direct upload. */
export async function uploadExists(storedFilename: string): Promise<boolean> {
  return fileExists(VIDEO_BUCKET, storedFilename);
}

export async function deleteStored(storedFilename: string): Promise<void> {
  await removeFile(VIDEO_BUCKET, storedFilename);
}
