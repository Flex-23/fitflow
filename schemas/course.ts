import { z } from "zod";

export const trainingExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  reps: z.string().trim().min(1).max(40),
  videoId: z.string().nullish(),
  videoToken: z.string().nullish(),
  supersetGroup: z.number().int().nullish(),
});

export const trainingDaySchema = z.object({
  label: z.string().trim().min(1).max(60),
  exercises: z.array(trainingExerciseSchema).max(40),
});

export const trainingCourseSchema = z.object({
  memberId: z.string().nullish(),
  title: z.string().trim().max(120).nullish(),
  isTemplate: z.boolean().default(false),
  days: z.array(trainingDaySchema).min(1).max(5),
});

export const nutritionDaySchema = z.object({
  label: z.string().trim().max(60).nullish(),
  meals: z.array(z.string().max(500)).min(1).max(20),
});

export const nutritionCourseSchema = z.object({
  memberId: z.string().min(1),
  days: z.array(nutritionDaySchema).min(1).max(31),
});

export type TrainingCourseInput = z.infer<typeof trainingCourseSchema>;
export type NutritionCourseInput = z.infer<typeof nutritionCourseSchema>;
