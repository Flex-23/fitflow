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

  // Read the balance and record the payment in one serialisable transaction,
  // so a double submit (or two receptions at once) cannot both read the same
  // "remaining" and each collect it — the second conflicts and is rejected
  // rather than overpaying the subscription.
  let outcome:
    | { kind: "not_found" }
    | { kind: "already_settled" }
    | { kind: "ok"; applied: number; remaining: number; memberName: string };
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const sub = await tx.subscription.findUnique({
          where: { id: subscriptionId },
          include: { payments: true, member: true },
        });
        if (!sub) return { kind: "not_found" as const };

        const remaining = remainingBalance(sub.price, sub.payments);
        if (remaining <= 0) return { kind: "already_settled" as const };

        // Never accept more than what's still owed.
        const applied = Math.min(amount, remaining);
        await tx.payment.create({
          data: { subscriptionId, amount: applied, note, createdById: user.id },
        });
        return { kind: "ok" as const, applied, remaining, memberName: sub.member.name };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (e) {
    // A concurrent payment on the same subscription lost the serialisation
    // race; the winning one went through. Ask the caller to reload and retry.
    console.error("addPayment failed", e);
    return { error: "conflict" };
  }

  if (outcome.kind === "not_found") return { error: "not_found" };
  if (outcome.kind === "already_settled") return { error: "already_settled" };

  const left = outcome.remaining - outcome.applied;
  await logActivity({
    userId: user.id,
    action: "RECEIVE_PAYMENT",
    targetType: "Subscription",
    targetId: subscriptionId,
    details: `${outcome.memberName} • +${outcome.applied} • remaining ${left}`,
  });

  revalidatePath("/deferred");
  revalidatePath("/members");
  return { ok: true, data: { remaining: left } };
}
