import { z } from "zod";

export const planSchema = z.object({
  name: z.string().trim().min(1).max(60),
  durationDays: z.coerce.number().int().positive().max(3650),
  price: z.coerce.number().min(0).max(1_000_000),
});

export type PlanInput = z.infer<typeof planSchema>;
