import { NextResponse, type NextRequest } from "next/server";
import { memberFromAuthHeader } from "@/lib/member-app/auth";
import { getMemberPortal } from "@/lib/member-portal";

/** The signed-in member's profile + subscription (and a courses summary). */
export async function GET(req: NextRequest) {
  const m = await memberFromAuthHeader(req.headers.get("authorization"));
  if (!m) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const portal = await getMemberPortal(m.id);
  if (!portal) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, member: portal });
}
