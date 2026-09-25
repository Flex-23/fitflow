"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { paymentSchema } from "@/schemas/subscription";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { remainingBalance } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

export async function addPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("RECEPTION");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { subscriptionId, amount, note } = parsed.data;

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { payments: true, member: true },
  });
  if (!sub) return { error: "not_found" };

  const remaining = remainingBalance(sub.price, sub.payments);
  if (remaining <= 0) return { error: "already_settled" };

  // Never accept more than what's still owed.
  const applied = Math.min(amount, remaining);

  await prisma.payment.create({
    data: { subscriptionId, amount: applied, note, createdById: user.id },
  });

  await logActivity({
    userId: user.id,
    action: "RECEIVE_PAYMENT",
    targetType: "Subscription",
    targetId: subscriptionId,
    details: `${sub.member.name} • +${applied} • remaining ${remaining - applied}`,
  });

  revalidatePath("/deferred");
  revalidatePath("/members");
  return { ok: true, data: { remaining: remaining - applied } };
}
