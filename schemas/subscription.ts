import { z } from "zod";

/**
 * A subscription can only be frozen while it is running and has at least
 * this many days left. Shared by the server rule and the button that offers it.
 */
export const FREEZE_MIN_DAYS_LEFT = 5;

export const freezeSchema = z.object({
  subscriptionId: z.string().min(1),
  days: z.coerce.number().int().positive().max(365),
  reason: z.string().trim().min(2).max(500),
});

export const cancelSchema = z.object({
  subscriptionId: z.string().min(1),
  reason: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().max(500).optional()
  ),
});

export const renewSchema = z.object({
  memberId: z.string().min(1),
  planId: z.string().min(1),
  method: z.enum(["CASH", "DEFERRED"]),
  amountReceived: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).optional()
  ),
});

export const paymentSchema = z.object({
  subscriptionId: z.string().min(1),
  amount: z.coerce.number().positive().max(1_000_000),
  note: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().max(200).optional()
  ),
});

export type FreezeInput = z.infer<typeof freezeSchema>;
export type RenewInput = z.infer<typeof renewSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
