"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { expenseSchema, expenseUpdateSchema } from "@/schemas/finance";
import type { ActionState } from "@/lib/action-state";

/**
 * What an expense is called, when it is called anything.
 *
 * Every category names itself — rent is rent — so only "other" needs words,
 * and the words are already in the note. The first line of it becomes the
 * title, which is what the ledger and the reports show.
 */
function titleFrom(category: string, note: string | null | undefined): string | null {
  if (category !== "OTHER") return null;
  const firstLine = note?.split("\n")[0]?.trim();
  return firstLine ? firstLine.slice(0, 120) : null;
}

export async function createExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("FINANCE");
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  const title = titleFrom(d.category, d.note);

  const expense = await prisma.expense.create({
    data: {
      title,
      amount: d.amount,
      category: d.category,
      note: d.note ?? null,
      spentAt: d.spentAt ?? new Date(),
      createdById: user.id,
    },
  });

  await logActivity({
    userId: user.id,
    action: "CREATE_EXPENSE",
    targetType: "Expense",
    targetId: expense.id,
    details: `${title ?? d.category} • ${d.amount}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

/**
 * Correct a spend that was already recorded.
 *
 * Money is written down in a hurry at a desk, and a wrong figure or the
 * wrong category used to mean deleting the row and typing it again — which
 * loses who recorded it and when. This edits it in place and says so in the
 * activity log.
 */
export async function updateExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("FINANCE");
  const parsed = expenseUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const before = await prisma.expense.findUnique({
    where: { id: d.id },
    select: { amount: true, category: true },
  });
  if (!before) return { error: "not_found" };

  await prisma.expense.update({
    where: { id: d.id },
    data: {
      title: titleFrom(d.category, d.note),
      amount: d.amount,
      category: d.category,
      note: d.note ?? null,
      spentAt: d.spentAt ?? undefined,
    },
  });

  await logActivity({
    userId: user.id,
    action: "UPDATE_EXPENSE",
    targetType: "Expense",
    targetId: d.id,
    details: `${before.category} ${before.amount} → ${d.category} ${d.amount}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<ActionState> {
  const user = await requireSection("FINANCE");
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { title: true, category: true, amount: true },
  });
  if (!expense) return { error: "not_found" };

  await prisma.expense.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "DELETE_EXPENSE",
    targetType: "Expense",
    targetId: id,
    details: `${expense.title ?? expense.category} • ${expense.amount}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}
