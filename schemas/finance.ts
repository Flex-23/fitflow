import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const EXPENSE_CATEGORIES = [
  "RENT",
  "SALARY",
  "EQUIPMENT",
  "MAINTENANCE",
  "UTILITIES",
  "SUPPLIES",
  "OTHER",
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];

export const expenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  amount: z.coerce.number().positive().max(1_000_000_000),
  category: z.enum(EXPENSE_CATEGORIES),
  note: optionalText(500),
  // Defaults to today when the form leaves it empty.
  spentAt: z.preprocess(
    emptyToUndefined,
    z.coerce.date().optional()
  ),
});

export const debtSchema = z.object({
  personName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20),
  amount: z.coerce.number().positive().max(1_000_000_000),
  note: optionalText(500),
  /** Optional down payment taken at the moment the debt is recorded. */
  received: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0).max(1_000_000_000).optional()
  ),
});

export const debtPaymentSchema = z.object({
  debtId: z.string().min(1),
  amount: z.coerce.number().positive().max(1_000_000_000),
  note: optionalText(200),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type DebtInput = z.infer<typeof debtSchema>;
export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;
