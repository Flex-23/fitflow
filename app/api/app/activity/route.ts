import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberFromAuthHeader } from "@/lib/member-app/auth";

/**
 * The member's gate attendance: this month's visits, the last one, and a recent
 * list — all from GateLog (card taps and app opens alike). Used by the Account
 * and Gate tabs.
 */
export async function GET(req: NextRequest) {
  const m = await memberFromAuthHeader(req.headers.get("authorization"));
  if (!m) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthCount, totalCount, recent, dayLogs] = await Promise.all([
    prisma.gateLog.count({ where: { memberId: m.id, allowed: true, createdAt: { gte: startOfMonth } } }),
    prisma.gateLog.count({ where: { memberId: m.id, allowed: true } }),
    prisma.gateLog.findMany({
      where: { memberId: m.id, allowed: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { createdAt: true, source: true, reason: true },
    }),
    prisma.gateLog.findMany({
      where: { memberId: m.id, allowed: true, createdAt: { gte: new Date(now.getTime() - 45 * 86_400_000) } },
      select: { createdAt: true },
    }),
  ]);

  // Distinct attendance days in Baghdad time (UTC+3), for the streak and week.
  const TZ = 3 * 3_600_000;
  const key = (d: Date) => new Date(d.getTime() + TZ).toISOString().slice(0, 10);
  const days = new Set(dayLogs.map((l) => key(l.createdAt)));
  const today = key(now);

  let streak = 0;
  let cursor = new Date(today + "T00:00:00Z");
  if (!days.has(today)) cursor = new Date(cursor.getTime() - 86_400_000); // yesterday
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }

  const weekFrom = new Date(new Date(today + "T00:00:00Z").getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  let weekDays = 0;
  for (const k of days) if (k >= weekFrom && k <= today) weekDays++;

  return NextResponse.json({
    ok: true,
    monthCount,
    totalCount,
    streak,
    weekDays,
    weekGoal: 4,
    last: recent[0]?.createdAt ?? null,
    recent: recent.map((r) => ({
      at: r.createdAt,
      // app opens carry the direction in `reason`; a card tap is an entry.
      direction: r.reason === "out" ? "out" : "in",
      source: r.source,
    })),
  });
}
