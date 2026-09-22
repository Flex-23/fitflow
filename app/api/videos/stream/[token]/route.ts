import { prisma } from "@/lib/prisma";
import { playbackUrl } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/dal";
import { getWatchSession } from "@/lib/watch-session";

/**
 * Gate-keeps an exercise video and hands the browser a short-lived signed URL
 * for the file itself.
 *
 * The bytes cannot flow through this function — a serverless response is
 * capped at 4.5 MB — so playback is a redirect into Supabase Storage. The
 * signed URL expires within minutes, which is what limits a copied link;
 * unlike the previous local-disk version this cannot also block a direct
 * download, and screen recording was never preventable anyway.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const video = await prisma.video.findUnique({
    where: { hiddenToken: token },
    select: { storedFilename: true },
  });
  if (!video) return new Response(null, { status: 404 });

  // Access: staff who still exist and are active (checked against the
  // database, not just the cookie) OR a member holding a watch session.
  const [staff, watcher] = await Promise.all([getCurrentUser(), getWatchSession()]);
  if (!staff && !watcher) return new Response(null, { status: 403 });

  // Only a <video> element on our own pages may follow this. Pasting the URL
  // into the address bar (Sec-Fetch-Dest: document) or fetch()/curl (empty)
  // are refused, which keeps the signed URL out of casual hands.
  const dest = req.headers.get("sec-fetch-dest");
  const site = req.headers.get("sec-fetch-site");
  if (dest && dest !== "video") return new Response(null, { status: 403 });
  if (site && site !== "same-origin") return new Response(null, { status: 403 });

  const url = await playbackUrl(video.storedFilename);
  if (!url) return new Response(null, { status: 404 });

  return new Response(null, {
    status: 307,
    headers: { Location: url, "Cache-Control": "private, no-store" },
  });
}
