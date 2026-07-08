/**
 * Onboarding Validation Schema (Zod)
 * ═══════════════════════════════════
 *
 * WHAT IS ZOD?
 * ────────────
 * A TypeScript-first validation library. You define a "schema"
 * that describes the expected shape + constraints of your data.
 * Zod validates at RUNTIME (unlike TypeScript which validates at COMPILE time).
 *
 * WHY BOTH ZOD AND TYPESCRIPT?
 * ────────────────────────────
 * TypeScript trusts what you tell it. If the API receives { age: "hello" },
 * TypeScript thinks it's a number because the type says so. It won't catch this.
 * Zod actually checks the value at runtime and throws a clear error.
 *
 * SHARED BETWEEN:
 * ───────────────
 * - Client: form validation (shows errors instantly as user types)
 * - Server: API route validation (rejects invalid data before touching DB)
 *
 * ─────────────────────────────────────────────────────────────────
 * STEP 3 UPDATE (July 7, 2026):
 * Step 4 schema expanded with targetWeightKg and timelineMonths.
 * These allow the engine to calculate a deficit from a real goal
 * instead of using static preset buttons.
 * ─────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

// ── Step 1: Identity ─────────────────────────────
export const step1Schema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be under 50 characters"),
  dateOfBirth: z
    .string()
    .refine((val) => {
      const date = new Date(val);
      const age = Math.floor(
        (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      return age >= 13 && age <= 120;
    }, "You must be between 13 and 120 years old"),
  sex: z.enum(["MALE", "FEMALE"]),
});

// ── Step 2: Body Measurements ────────────────────
export const step2Schema = z.object({
  weightKg: z
    .number()
    .min(30, "Weight must be at least 30 kg")
    .max(300, "Weight must be under 300 kg"),
  heightCm: z
    .number()
    .min(100, "Height must be at least 100 cm")
    .max(250, "Height must be under 250 cm"),
});

// ── Step 3: Activity Level ───────────────────────
export const step3Schema = z.object({
  activityLevel: z.enum([
    "SEDENTARY",
    "LIGHT",
    "MODERATE",
    "ACTIVE",
    "VERY_ACTIVE",
  ]),
});

// ── Step 4: Fitness Goal ─────────────────────────
// Updated in Step 3: now includes target weight and timeline.
// The goal enum is still stored for the engine's protein multiplier lookup.
// targetWeightKg + timelineMonths are used by calculateGoalFromTimeline().
export const step4Schema = z.object({
  goal: z.enum(["LOSE_FAT", "GAIN_MUSCLE", "MAINTAIN", "RECOMP"]),
  targetWeightKg: z
    .number()
    .min(30, "Target weight must be at least 30 kg")
    .max(300, "Target weight must be under 300 kg")
    .optional(),
  timelineMonths: z
    .number()
    .min(1, "Timeline must be at least 1 month")
    .max(24, "Timeline must be under 24 months")
    .optional(),
});

// ── Step 5: Preferences ──────────────────────────
export const step5Schema = z.object({
  dietaryType: z.enum(["VEG", "NON_VEG", "VEGAN", "EGGETARIAN"]),
  strictness: z.enum(["RELAXED", "MODERATE", "STRICT"]).default("MODERATE"),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]).default("METRIC"),
});

// ── Combined: Full onboarding form ───────────────
export const onboardingSchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema)
  .merge(step4Schema)
  .merge(step5Schema);

// TypeScript type derived from the Zod schema.
// This ensures the form type and validation schema are ALWAYS in sync.
// If you add a field to the schema, TypeScript forces you to handle it everywhere.
export type OnboardingFormData = z.infer<typeof onboardingSchema>;

// Individual step types
export type Step1Data = z.infer<typeof step1Schema>;
export type Step2Data = z.infer<typeof step2Schema>;
export type Step3Data = z.infer<typeof step3Schema>;
export type Step4Data = z.infer<typeof step4Schema>;
export type Step5Data = z.infer<typeof step5Schema>;
