import { NextResponse, type NextRequest } from "next/server";
import { memberFromAuthHeader } from "@/lib/member-app/auth";
import { createGateOpenCommand } from "@/lib/gate/app-open";

/**
 * Open the gate from the app.
 *
 *   POST { direction: "in" | "out" }  (Bearer token)
 *   → { ok: true } | { ok: false, reason: "off" | "not_active" | "too_many" | "error" }
 *
 * Queues a command the gate bridge acts on — the same channel the web page uses.
 */
export async function POST(req: NextRequest) {
  const m = await memberFromAuthHeader(req.headers.get("authorization"));
  if (!m) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  let direction = "in";
  try {
    const body = await req.json();
    if (typeof body?.direction === "string") direction = body.direction;
  } catch {
    // default to "in"
  }

  const res = await createGateOpenCommand(m.id, direction);
  return NextResponse.json(res);
}
