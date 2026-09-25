"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { freezeSchema, cancelSchema, renewSchema } from "@/schemas/subscription";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { type ActionState, DAY_MS } from "@/lib/action-state";

export async function freezeSubscription(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("RECEPTION");
  const parsed = freezeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { subscriptionId, days, reason } = parsed.data;

  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return { error: "not_found" };
  if (sub.status === "CANCELLED") return { error: "invalid_state" };

  // Extend the end date by the frozen days (compensation) and pause the sub.
  const base = sub.freezeUntil && sub.freezeUntil > new Date() ? sub.freezeUntil : new Date();
  const freezeUntil = new Date(base.getTime() + days * DAY_MS);
  const newEnd = new Date(sub.endDate.getTime() + days * DAY_MS);

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: "FROZEN",
        freezeUntil,
        endDate: newEnd,
        frozenDaysTotal: { increment: days },
      },
    }),
    prisma.freezeRecord.create({
      data: {
        subscriptionId,
        days,
        reason,
        endsAt: freezeUntil,
        createdById: user.id,
      },
    }),
  ]);

  await logActivity({
    userId: user.id,
    action: "FREEZE_SUBSCRIPTION",
    targetType: "Subscription",
    targetId: subscriptionId,
    details: `${days} days • ${reason}`,
  });

  revalidatePath("/active");
  return { ok: true };
}

export async function unfreezeSubscription(subscriptionId: string) {
  const user = await requireSection("RECEPTION");
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub || sub.status !== "FROZEN") return;

  const now = new Date();
  const status = sub.endDate < now ? "EXPIRED" : "ACTIVE";
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status, freezeUntil: null },
  });
  await logActivity({
    userId: user.id,
    action: "UNFREEZE_SUBSCRIPTION",
    targetType: "Subscription",
    targetId: subscriptionId,
  });
  revalidatePath("/active");
}

export async function cancelSubscription(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("RECEPTION");
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { subscriptionId, reason } = parsed.data;

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", freezeUntil: null },
  });
  await logActivity({
    userId: user.id,
    action: "CANCEL_SUBSCRIPTION",
    targetType: "Subscription",
    targetId: subscriptionId,
    details: reason ?? undefined,
  });

  revalidatePath("/active");
  revalidatePath("/expired");
  return { ok: true };
}

export async function renewSubscription(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("RECEPTION");
  const parsed = renewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { memberId, planId, method, amountReceived } = parsed.data;

  const [member, plan] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId } }),
    prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
  ]);
  if (!member) return { error: "not_found" };
  if (!plan || !plan.isActive) return { error: "invalid_plan" };

  // Renewal ALWAYS takes the latest plan price.
  const price = Number(plan.price);
  const received = method === "CASH" ? price : Math.min(amountReceived ?? 0, price);

  // Early renewal: if the member still has a running subscription, the new one
  // queues up after it (from its end date) so no paid days are lost. This also
  // chains correctly if an upcoming subscription is already queued.
  const now = new Date();
  const running = await prisma.subscription.findFirst({
    where: { memberId, status: { in: ["ACTIVE", "FROZEN"] }, endDate: { gt: now } },
    orderBy: { endDate: "desc" },
  });
  const startDate = running ? running.endDate : now;
  const endDate = new Date(startDate.getTime() + plan.durationDays * DAY_MS);

  const subscription = await prisma.subscription.create({
    data: {
      memberId,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      price,
      method,
      status: "ACTIVE",
      startDate,
      endDate,
      createdById: user.id,
      payments:
        received > 0
          ? { create: [{ amount: received, createdById: user.id }] }
          : undefined,
    },
  });

  await logActivity({
    userId: user.id,
    action: "RENEW_SUBSCRIPTION",
    targetType: "Subscription",
    targetId: subscription.id,
    details: `${member.name} • ${plan.name} • ${method}${running ? " • early" : ""}`,
  });

  revalidatePath("/active");
  revalidatePath("/expired");
  revalidatePath("/deferred");
  revalidatePath("/members");
  return { ok: true };
}
