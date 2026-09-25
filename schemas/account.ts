import { z } from "zod";

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const ROLES = ["MANAGER", "RECEPTION", "CAPTAIN"] as const;

export const createAccountSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(100),
  role: z.enum(ROLES),
  canAddVideos: checkbox,
});

export const updateAccountSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(2).max(60),
  role: z.enum(ROLES),
  isActive: checkbox,
  canAddVideos: checkbox,
});

/** A user changing their own password must prove they know the current one. */
export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(100),
    confirm: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirm, { path: ["confirm"], message: "mismatch" });

/**
 * The master changing its own name and password. The password is optional:
 * moving the username alone is a legitimate thing to want.
 */
export const masterCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  currentPassword: z.string().min(1),
  newPassword: z.union([z.string().min(6).max(100), z.literal("")]).optional(),
});

export const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(6).max(100),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
