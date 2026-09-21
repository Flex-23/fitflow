"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { planSchema } from "@/schemas/plan";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/lib/action-state";

/** Create (no id) or update (with id) a subscription plan. Manager only. */
export async function savePlan(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("MANAGER");
  const id = String(formData.get("id") ?? "");
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (id) {
    // Editing a plan only affects new/renewing subscriptions — existing
    // subscriptions snapshot their price at purchase.
    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: parsed.data,
    });
    await logActivity({
      userId: user.id,
      action: "UPDATE_PLAN",
      targetType: "SubscriptionPlan",
      targetId: plan.id,
      details: `${plan.name} • ${parsed.data.price}`,
    });
  } else {
    const plan = await prisma.subscriptionPlan.create({ data: parsed.data });
    await logActivity({
      userId: user.id,
      action: "CREATE_PLAN",
      targetType: "SubscriptionPlan",
      targetId: plan.id,
      details: `${plan.name} • ${parsed.data.price}`,
    });
  }

  revalidatePath("/plans");
  revalidatePath("/registration");
  return { ok: true };
}

export async function togglePlanActive(id: string, isActive: boolean) {
  const user = await requireRole("MANAGER");
  await prisma.subscriptionPlan.update({ where: { id }, data: { isActive } });
  await logActivity({
    userId: user.id,
    action: "ARCHIVE_PLAN",
    targetType: "SubscriptionPlan",
    targetId: id,
    details: isActive ? "activated" : "archived",
  });
  revalidatePath("/plans");
  revalidatePath("/registration");
}
