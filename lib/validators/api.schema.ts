/**
 * API Request Validation Schemas (Zod)
 * ═════════════════════════════════════
 *
 * HOUSE RULE: no request body reaches the service layer without passing a
 * schema. The database must never be the first place bad data gets noticed —
 * a negative-calorie write silently corrupts every chart, AI insight, and
 * adaptive-TDEE calculation that later reads it.
 *
 * The onboarding route established the pattern (onboarding.schema.ts);
 * these schemas extend it to every other mutating route.
 *
 * USAGE (same shape in every route):
 *   const parsed = someSchema.safeParse(await request.json());
 *   if (!parsed.success) return 400 with parsed.error
 */

import { z } from "zod";

/** "YYYY-MM-DD" — the only date format the API accepts */
export const dateStrSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const mealTypeSchema = z.enum([
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "SNACK",
]);

// ─── POST /api/nutrition/log — database food ─────────────────
export const logDbFoodSchema = z.object({
  foodId: z.string().min(1),
  date: dateStrSchema,
  mealType: mealTypeSchema,
  quantityGrams: z.number().positive().max(5000),
  isRestaurant: z.boolean().default(false),
});

// ─── POST /api/nutrition/log — custom food ───────────────────
export const logCustomFoodSchema = z.object({
  date: dateStrSchema,
  mealType: mealTypeSchema,
  name: z.string().trim().min(1).max(100),
  quantity: z.number().positive().max(5000),
  unit: z.string().max(20).default("g"),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000).default(0),
  carbs: z.number().min(0).max(1000).default(0),
  fat: z.number().min(0).max(1000).default(0),
});

// ─── POST /api/workout — start a session ─────────────────────
export const startWorkoutSchema = z.object({
  date: dateStrSchema.optional(),
  mode: z.enum(["LIVE", "RECALL"]).default("RECALL"),
  splitType: z
    .enum(["PPL", "UPPER_LOWER", "BRO", "FULL_BODY", "CUSTOM"])
    .optional(),
});

// ─── POST /api/workout/[id]/sets — log a set ─────────────────
export const logSetSchema = z.object({
  exerciseId: z.string().min(1),
  setNumber: z.number().int().min(1).max(100),
  weight: z.number().min(0).max(1000).optional(),
  reps: z.number().int().min(0).max(200).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  isWarmup: z.boolean().default(false),
});

// ─── PUT /api/workout/[id]/sets — finish a session ───────────
export const finishSessionSchema = z.object({
  durationMin: z.number().int().positive().max(1440),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
});

// ─── POST /api/progress/weight — log weight ──────────────────
export const logWeightSchema = z.object({
  date: dateStrSchema.optional(),
  weightKg: z.number().min(30).max(300),
  notes: z.string().max(500).optional(),
});

// ─── POST /api/templates — save a session as a template ─────
export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // The exercise list is derived SERVER-SIDE from this session's real
  // sets — the client cannot fabricate a template payload.
  fromSessionId: z.string().min(1),
});

// ─── POST /api/templates/[id]/start — start session from it ─
export const startFromTemplateSchema = z.object({
  date: dateStrSchema.optional(),
});

// ─── PUT /api/profile — update profile + recalculate targets ─
export const updateProfileSchema = z
  .object({
    weightKg: z.number().min(30).max(300).optional(),
    activityLevel: z
      .enum(["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"])
      .optional(),
    goal: z.enum(["LOSE_FAT", "GAIN_MUSCLE", "MAINTAIN", "RECOMP"]).optional(),
    dietaryType: z.enum(["VEG", "NON_VEG", "VEGAN", "EGGETARIAN"]).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ─── POST /api/ai/parse-meal — AI meal parsing ───────────────
export const parseMealRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(3, "Please describe your meal (at least 3 characters)")
    .max(1000),
  mealType: mealTypeSchema,
  date: dateStrSchema,
});
