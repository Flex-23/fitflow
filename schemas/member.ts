import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

const requiredInt = (max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(max));

const requiredFloat = (max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().positive().max(max));

const optionalFloat = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive().max(max).optional()
  );

export const FEMALE_MEASUREMENTS = ["chest", "waist", "hips", "glutes", "arm"] as const;
export type FemaleMeasurement = (typeof FEMALE_MEASUREMENTS)[number];

const memberFields = z.object({
  name: z.string().trim().min(2),
  phone: z.string().trim().min(6).max(20),
  // Access card as typed by the desk reader (see lib/gate/card.ts).
  cardNumber: z.preprocess(
    emptyToUndefined,
    z.string().trim().regex(/^\d{4,20}$/).optional()
  ),
  gender: z.enum(["MALE", "FEMALE"]),
  age: requiredInt(120),
  height: requiredFloat(300), // cm
  weight: requiredFloat(500), // kg
  // Only meaningful (and required) for female members — see `femaleRule`.
  chest: optionalFloat(300),
  waist: optionalFloat(300),
  hips: optionalFloat(300),
  glutes: optionalFloat(300),
  arm: optionalFloat(150),
});

type MemberFields = z.infer<typeof memberFields>;

/** Female members must provide every extra measurement. */
function femaleRule(d: MemberFields, ctx: z.RefinementCtx) {
  if (d.gender !== "FEMALE") return;
  for (const key of FEMALE_MEASUREMENTS) {
    if (d[key] == null) {
      ctx.addIssue({ code: "custom", path: [key], message: "required" });
    }
  }
}

export const memberSchema = memberFields.superRefine(femaleRule);

export const registrationSchema = memberFields
  .extend({
    planId: z.string().min(1),
    method: z.enum(["CASH", "DEFERRED"]),
    amountReceived: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0).optional()
    ),
  })
  .superRefine(femaleRule);

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type MemberInput = z.infer<typeof memberSchema>;

/** Persisted measurement columns; male members always store nulls. */
export function measurementData(d: MemberFields) {
  const female = d.gender === "FEMALE";
  return {
    chest: female ? d.chest ?? null : null,
    waist: female ? d.waist ?? null : null,
    hips: female ? d.hips ?? null : null,
    glutes: female ? d.glutes ?? null : null,
    arm: female ? d.arm ?? null : null,
  };
}
