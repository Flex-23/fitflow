"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
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
  const user = await requireSection("FINANCE");
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
  const user = await requireSection("FINANCE");
  const parsed = debtPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { debtId, amount, note } = parsed.data;

  // Balance read and instalment written atomically (serialisable), so a double
  // submit cannot both collect the same remaining and overpay the debt.
  let outcome:
    | { kind: "not_found" }
    | { kind: "already_settled" }
    | { kind: "ok"; applied: number; remaining: number; personName: string };
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const debt = await tx.debt.findUnique({
          where: { id: debtId },
          include: { payments: true },
        });
        if (!debt) return { kind: "not_found" as const };

        const remaining = remainingBalance(debt.amount, debt.payments);
        if (remaining <= 0) return { kind: "already_settled" as const };

        // Never accept more than what is still owed.
        const applied = Math.min(amount, remaining);
        await tx.debtPayment.create({
          data: { debtId, amount: applied, note: note ?? null, createdById: user.id },
        });
        return { kind: "ok" as const, applied, remaining, personName: debt.personName };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (e) {
    console.error("addDebtPayment failed", e);
    return { error: "conflict" };
  }

  if (outcome.kind === "not_found") return { error: "not_found" };
  if (outcome.kind === "already_settled") return { error: "already_settled" };

  const left = outcome.remaining - outcome.applied;
  await logActivity({
    userId: user.id,
    action: "RECEIVE_DEBT_PAYMENT",
    targetType: "Debt",
    targetId: debtId,
    details: `${outcome.personName} • +${outcome.applied} • remaining ${left}`,
  });

  revalidatePath("/debts");
  revalidatePath("/reports");
  return { ok: true, data: { remaining: left } };
}

export async function deleteDebt(id: string): Promise<ActionState> {
  const user = await requireSection("FINANCE");
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
