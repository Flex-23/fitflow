import { z } from "zod";

export const rateVideoSchema = z.object({
  token: z.string().min(1),
  stars: z.coerce.number().int().min(1).max(5),
  // A line, not a review — the DB column is the same limit.
  note: z
    .string()
    .trim()
    .max(150)
    .optional()
    .transform((v) => v || undefined),
});
