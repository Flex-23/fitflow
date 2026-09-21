"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { remainingBalance } from "@/lib/money";
import { debtSchema, debtPaymentSchema } from "@/schemas/finance";
import type { ActionState } from "@/lib/action-state";

/** Record a new debt, optionally with a down payment taken on the spot. */
export async function createDebt(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("MANAGER");
  const parsed = debtSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  // Never let the opening payment exceed the debt itself.
  const received = Math.min(d.received ?? 0, d.amount);

  const debt = await prisma.debt.create({
    data: {
      personName: d.personName,
      phone: d.phone,
      amount: d.amount,
      note: d.note ?? null,
      createdById: user.id,
      payments:
        received > 0
          ? { create: [{ amount: received, createdById: user.id }] }
          : undefined,
    },
  });

  await logActivity({
    userId: user.id,
    action: "CREATE_DEBT",
    targetType: "Debt",
    targetId: debt.id,
    details: `${d.personName} • ${d.amount}${received > 0 ? ` • paid ${received}` : ""}`,
  });

  revalidatePath("/debts");
  revalidatePath("/reports");
  return { ok: true, data: { remaining: d.amount - received } };
}

/** Take an instalment against an existing debt. */
export async function addDebtPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("MANAGER");
  const parsed = debtPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { debtId, amount, note } = parsed.data;

  const debt = await prisma.debt.findUnique({
    where: { id: debtId },
    include: { payments: true },
  });
  if (!debt) return { error: "not_found" };

  const remaining = remainingBalance(debt.amount, debt.payments);
  if (remaining <= 0) return { error: "already_settled" };

  // Never accept more than what is still owed.
  const applied = Math.min(amount, remaining);

  await prisma.debtPayment.create({
    data: { debtId, amount: applied, note: note ?? null, createdById: user.id },
  });

  await logActivity({
    userId: user.id,
    action: "RECEIVE_DEBT_PAYMENT",
    targetType: "Debt",
    targetId: debtId,
    details: `${debt.personName} • +${applied} • remaining ${remaining - applied}`,
  });

  revalidatePath("/debts");
  revalidatePath("/reports");
  return { ok: true, data: { remaining: remaining - applied } };
}

export async function deleteDebt(id: string): Promise<ActionState> {
  const user = await requireRole("MANAGER");
  const debt = await prisma.debt.findUnique({
    where: { id },
    select: { personName: true, amount: true },
  });
  if (!debt) return { error: "not_found" };

  // Payments cascade with the debt.
  await prisma.debt.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "DELETE_DEBT",
    targetType: "Debt",
    targetId: id,
    details: `${debt.personName} • ${debt.amount}`,
  });

  revalidatePath("/debts");
  revalidatePath("/reports");
  return { ok: true };
}
