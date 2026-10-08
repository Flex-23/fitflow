import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberFromAuthHeader } from "@/lib/member-app/auth";

/** The member's subscription history and payments, for the Subscription tab. */
export async function GET(req: NextRequest) {
  const m = await memberFromAuthHeader(req.headers.get("authorization"));
  if (!m) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const subs = await prisma.subscription.findMany({
    where: { memberId: m.id },
    orderBy: { endDate: "desc" },
    take: 20,
    include: { payments: { orderBy: { createdAt: "desc" }, select: { amount: true, note: true, createdAt: true } } },
  });

  return NextResponse.json({
    ok: true,
    subscriptions: subs.map((s) => ({
      planName: s.planName,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      price: Number(s.price),
      method: s.method,
      payments: s.payments.map((p) => ({ amount: Number(p.amount), note: p.note, at: p.createdAt })),
    })),
  });
}
