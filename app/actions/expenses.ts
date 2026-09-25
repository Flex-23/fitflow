"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { expenseSchema } from "@/schemas/finance";
import type { ActionState } from "@/lib/action-state";

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

  const expense = await prisma.expense.create({
    data: {
      title: d.title,
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
    details: `${d.title} • ${d.amount}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<ActionState> {
  const user = await requireSection("FINANCE");
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { title: true, amount: true },
  });
  if (!expense) return { error: "not_found" };

  await prisma.expense.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "DELETE_EXPENSE",
    targetType: "Expense",
    targetId: id,
    details: `${expense.title} • ${expense.amount}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}
