"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { registrationSchema, memberSchema, measurementData } from "@/schemas/member";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { sendWelcomeMessage } from "@/lib/whatsapp";
import { cardData } from "@/lib/gate/card";
import { type ActionState, DAY_MS } from "@/lib/action-state";

/** True when another member already holds this card. */
async function cardTaken(cardNumber: string | null, exceptId?: string): Promise<boolean> {
  if (!cardNumber) return false;
  const clash = await prisma.member.findFirst({
    where: { cardNumber, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return !!clash;
}

export async function registerMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("RECEPTION");

  const parsed = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.member.findUnique({ where: { phone: data.phone } });
  if (existing) return { error: "phone_exists" };

  const card = cardData(data.cardNumber);
  if (await cardTaken(card.cardNumber)) return { error: "card_exists" };

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: data.planId },
  });
  if (!plan || !plan.isActive) return { error: "invalid_plan" };

  const price = Number(plan.price);
  const received =
    data.method === "CASH" ? price : Math.min(data.amountReceived ?? 0, price);
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * DAY_MS);

  const { member } = await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        name: data.name,
        phone: data.phone,
        gender: data.gender,
        age: data.age,
        height: data.height,
        weight: data.weight,
        ...measurementData(data),
        ...card,
      },
    });
    const subscription = await tx.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        price,
        method: data.method,
        status: "ACTIVE",
        startDate,
        endDate,
        createdById: user.id,
      },
    });
    if (received > 0) {
      await tx.payment.create({
        data: {
          subscriptionId: subscription.id,
          amount: received,
          createdById: user.id,
        },
      });
    }
    return { member, subscription };
  });

  await logActivity({
    userId: user.id,
    action: "REGISTER_MEMBER",
    targetType: "Member",
    targetId: member.id,
    details: `${data.name} • ${plan.name} • ${data.method}`,
  });

  // The manager is alerted to this deferred balance automatically: the member
  // now appears in the live "outstanding balances" notifications section.

  // WhatsApp welcome (stubbed/disabled).
  await sendWelcomeMessage(data.phone, data.name);

  revalidatePath("/members");
  revalidatePath("/active");
  revalidatePath("/deferred");

  return { ok: true, data: { memberId: member.id } };
}

export async function updateMember(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("RECEPTION");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "invalid" };

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const clash = await prisma.member.findFirst({
    where: { phone: data.phone, NOT: { id } },
  });
  if (clash) return { error: "phone_exists" };

  const card = cardData(data.cardNumber);
  if (await cardTaken(card.cardNumber, id)) return { error: "card_exists" };

  await prisma.member.update({
    where: { id },
    data: {
      name: data.name,
      phone: data.phone,
      gender: data.gender,
      age: data.age,
      height: data.height,
      weight: data.weight,
      ...measurementData(data),
      ...card,
    },
  });
  await logActivity({
    userId: user.id,
    action: "UPDATE_MEMBER",
    targetType: "Member",
    targetId: id,
    details: data.name,
  });

  revalidatePath("/members");
  return { ok: true };
}

/**
 * Permanently remove a member. Subscriptions, payments, freezes, courses and
 * notifications go with it via the schema's ON DELETE CASCADE rules, and the
 * course share links stop working because the PDFs are rendered from those
 * rows rather than stored.
 */
export async function deleteMember(id: string): Promise<ActionState> {
  const user = await requireRole("RECEPTION");
  if (!id) return { error: "invalid" };

  const member = await prisma.member.findUnique({
    where: { id },
    select: { name: true, phone: true },
  });
  if (!member) return { error: "not_found" };

  await prisma.member.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "DELETE_MEMBER",
    targetType: "Member",
    targetId: id,
    details: `${member.name} • ${member.phone}`,
  });

  revalidateMemberViews();
  return { ok: true };
}

/** Bulk removal from the members archive. Manager only. */
export async function deleteMembers(ids: string[]): Promise<ActionState> {
  const user = await requireRole("MANAGER");
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return { error: "invalid" };

  const members = await prisma.member.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  if (members.length === 0) return { error: "not_found" };

  const { count } = await prisma.member.deleteMany({
    where: { id: { in: members.map((m) => m.id) } },
  });

  await logActivity({
    userId: user.id,
    action: "DELETE_MEMBER",
    targetType: "Member",
    details: `${count} أعضاء • ${members
      .slice(0, 5)
      .map((m) => m.name)
      .join(", ")}${members.length > 5 ? "…" : ""}`,
  });

  revalidateMemberViews();
  return { ok: true, data: { count } };
}

function revalidateMemberViews() {
  revalidatePath("/members");
  revalidatePath("/archive");
  revalidatePath("/active");
  revalidatePath("/expired");
  revalidatePath("/deferred");
}
