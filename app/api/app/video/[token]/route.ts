import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberFromAuthHeader } from "@/lib/member-app/auth";
import { playbackUrl } from "@/lib/storage";

/**
 * A playable URL for one exercise video, for the app's in-app player.
 *
 *   GET /api/app/video/<token>   (Bearer)
 *   → { ok, kind: "upload" | "link", url, provider? }
 *
 * Uploaded clips get a short-lived signed URL (played natively); links return
 * their address (opened in an in-app web view). The member must be signed in.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const m = await memberFromAuthHeader(req.headers.get("authorization"));
  if (!m) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const { token } = await params;
  const video = await prisma.video.findUnique({
    where: { hiddenToken: token },
    select: { source: true, storedFilename: true, url: true },
  });
  if (!video) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  if (video.source === "UPLOAD") {
    if (!video.storedFilename) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    const url = await playbackUrl(video.storedFilename);
    if (!url) return NextResponse.json({ ok: false, reason: "storage_off" }, { status: 503 });
    return NextResponse.json({ ok: true, kind: "upload", url });
  }

  if (!video.url) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, kind: "link", url: video.url });
}
