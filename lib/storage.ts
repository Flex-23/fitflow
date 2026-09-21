import "server-only";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

import { MAX_VIDEO_BYTES } from "./video-formats";

export class UploadTooLarge extends Error {
  constructor() {
    super("upload exceeds the size limit");
    this.name = "UploadTooLarge";
  }
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || "./storage/videos";
}

export function resolveStored(filename: string): string {
  // Guard against path traversal in the stored filename.
  const safe = path.basename(filename);
  return path.join(uploadDir(), safe);
}

export async function ensureUploadDir() {
  await mkdir(uploadDir(), { recursive: true });
}

/**
 * Persist an uploaded file to disk under a non-guessable stored name.
 *
 * Streams straight to disk so a large upload never sits in memory, and stops
 * the moment the byte budget is exceeded — a lying Content-Length cannot make
 * the server swallow more than the limit.
 */
export async function saveUpload(
  file: File,
  storedFilename: string,
  maxBytes = MAX_VIDEO_BYTES
) {
  await ensureUploadDir();
  const target = resolveStored(storedFilename);

  let written = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength;
      if (written > maxBytes) throw new UploadTooLarge();
      controller.enqueue(chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(file.stream().pipeThrough(limiter) as never),
      createWriteStream(target)
    );
  } catch (e) {
    // Never leave a truncated or oversized file behind.
    await unlink(target).catch(() => {});
    throw e;
  }
}

export async function deleteStored(filename: string) {
  try {
    await unlink(resolveStored(filename));
  } catch {
    // Already gone — ignore.
  }
}
