import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveStored } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/dal";
import { getWatchSession } from "@/lib/watch-session";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const video = await prisma.video.findUnique({
    where: { hiddenToken: token },
    select: { storedFilename: true, mimeType: true },
  });
  if (!video) return new Response(null, { status: 404 });

  // Access: staff who still exist and are active (checked against the
  // database, not just the cookie) OR a member holding a watch session.
  const [staff, watcher] = await Promise.all([getCurrentUser(), getWatchSession()]);
  if (!staff && !watcher) return new Response(null, { status: 403 });

  // Only a <video> element on our own pages may pull the stream. Pasting the
  // URL into the address bar (Sec-Fetch-Dest: document), fetch()/curl
  // (empty) or an <a download> (empty) are all refused, so the file cannot
  // simply be saved. Screen recording can never be stopped server-side; this
  // closes every direct download path.
  const dest = req.headers.get("sec-fetch-dest");
  const site = req.headers.get("sec-fetch-site");
  if (dest && dest !== "video") return new Response(null, { status: 403 });
  if (site && site !== "same-origin") return new Response(null, { status: 403 });

  const filePath = resolveStored(video.storedFilename);
  const info = await stat(filePath).catch(() => null);
  if (!info) return new Response(null, { status: 404 });

  const size = info.size;
  const type = video.mimeType || "video/mp4";
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match?.[1] ? parseInt(match[1], 10) : 0;
    let end = match?.[2] ? parseInt(match[2], 10) : size - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        // The stored file is only ever a video; never let a browser sniff it
        // into something it could execute.
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Type": type,
      "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
