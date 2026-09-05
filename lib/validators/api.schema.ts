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

// ─── /api/foods/custom — user-owned food entries ─────────────
//
// Macros are per 100g, matching the seeded `foods` table so both kinds of
// result can be priced with identical maths. Calories are NOT cross-checked
// against protein/carbs/fat: users copy the two numbers off a tub label and
// those rarely reconcile exactly (rounding, fibre, sugar alcohols). Rejecting
// a label the user is reading verbatim would be the wrong call.
export const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).nullish(),
  caloriesPer100g: z.number().min(0).max(1000),
  proteinPer100g: z.number().min(0).max(100),
  carbsPer100g: z.number().min(0).max(100),
  fatPer100g: z.number().min(0).max(100),
  fiberPer100g: z.number().min(0).max(100).nullish(),
  defaultUnit: z.string().trim().max(20).default("g"),
  defaultGrams: z.number().positive().max(2000).default(100),
});

// PATCH — every field optional, but at least one must be present, otherwise
// the request is a no-op the caller probably didn't intend.
export const updateCustomFoodSchema = customFoodSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
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
//
// weight/reps are POSITIVE, not just non-negative: a set at 0 kg or 0 reps
// isn't a set, and a negative load is nonsense the volume maths would happily
// consume. rpe is the 1-5 "Intensity" scale the UI actually offers — the old
// 1-10 RPE bound let the inline set editor save a 7 that no picker could
// produce and no label could describe.
//
// setNumber stays accepted and bounded but is now ADVISORY — the server
// derives max(setNumber)+1 under the session lock. Keeping the field avoids
// client/server version skew during deploy.
//
// clientRequestId: optional UUID generated once per logging attempt on the
// client; retries reuse it so a request that succeeded server-side but failed
// client-side is a no-op (idempotent replay via unique (session, client_request_id)).
export const logSetSchema = z.object({
  exerciseId: z.string().min(1),
  setNumber: z.number().int().min(1).max(100),
  weight: z.number().positive().max(1000).optional(),
  reps: z.number().int().positive().max(200).optional(),
  rpe: z.number().int().min(1).max(5).optional(),
  isWarmup: z.boolean().default(false),
  clientRequestId: z.string().uuid().optional(),
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
  // Optional subset: only these exercise ids from the session go into the
  // template (lets a user split one session into e.g. a Biceps + a Triceps
  // template). Omitted → all exercises, preserving the original behavior.
  exerciseIds: z.array(z.string().min(1)).min(1).max(20).optional(),
});

// ─── POST /api/templates/[id]/append — add session exercises to a template ─
export const appendToTemplateSchema = z.object({
  fromSessionId: z.string().min(1),
  exerciseIds: z.array(z.string().min(1)).min(1).max(20).optional(),
});

// ─── POST /api/templates/[id]/start — start session from it ─
export const startFromTemplateSchema = z.object({
  date: dateStrSchema.optional(),
});

// ─── PATCH /api/workout/[id]/sets — edit one logged set ──────
// All fields optional except setId: the client sends only what changed.
// rpe accepts null so the user can CLEAR an intensity they set by mistake.
// Same bounds as logSetSchema — editing a set must not be a way around the
// rules that logging one enforces.
export const updateSetSchema = z.object({
  setId: z.string().min(1),
  weight: z.number().positive().max(1000).optional(),
  reps: z.number().int().positive().max(200).optional(),
  rpe: z.number().int().min(1).max(5).nullable().optional(),
  isWarmup: z.boolean().optional(),
});

// ─── DELETE /api/workout/[id]/sets — remove one logged set ───
export const deleteSetSchema = z.object({
  setId: z.string().min(1),
});

// ─── PUT /api/templates/[id] — edit a saved template ─────────
// Unlike creation (server-derived from a session), editing accepts the
// full exercise list — but every entry is validated and the write is
// owner-scoped, so a user can only reshape their own template.
export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        name: z.string().min(1).max(120),
        muscleGroup: z.string().min(1).max(60),
        category: z.string().min(1).max(30),
        metValue: z.number().min(0).max(30),
        isCompound: z.boolean(),
        targetSets: z.number().int().min(1).max(10),
      })
    )
    .min(1, "A template needs at least one exercise")
    .max(20),
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

// ─── POST /api/share — create a share link for a template ────
// `kind` is fixed server-side (WORKOUT_TEMPLATE), never taken from the body.
// A provided title must be non-blank AFTER trimming — a whitespace-only
// title is meaningless and would otherwise fall back inconsistently; when
// omitted the server defaults to the template's own name.
export const createShareSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
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

// ─── DELETE /api/account — permanent account deletion ────────
// Typed confirmation only. The exact string "DELETE" is required so a stray
// click / autofill cannot wipe an account. Feature is inert until
// ACCOUNT_DELETION_DATABASE_URL + private.delete_user_account are provisioned.
export const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
});
