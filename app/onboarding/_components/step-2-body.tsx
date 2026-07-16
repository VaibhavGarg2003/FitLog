"use client";

import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { step2Schema } from "@/lib/validators/onboarding.schema";
import { cn } from "@/lib/utils/cn";

/** Schema bounds — used for BMI preview and placeholder hints. */
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;

/**
 * Parse a number field without clamping.
 * Empty / incomplete input → undefined so the user can clear and retype.
 */
function parseOptionalNumber(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** Real-time field error from Zod step2Schema for a single field. */
function fieldError(
  field: "weightKg" | "heightCm",
  value: number | undefined
): string | undefined {
  if (value === undefined) return undefined;
  const validation = step2Schema.safeParse({
    weightKg: field === "weightKg" ? value : MIN_WEIGHT_KG,
    heightCm: field === "heightCm" ? value : MIN_HEIGHT_CM,
  });
  if (validation.success) return undefined;
  return validation.error.flatten().fieldErrors[field]?.[0];
}

export function Step2Body() {
  const { formData, updateFormData, nextStep, prevStep } =
    useOnboardingStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Local strings: never clamp while typing (clamping "7" → 30 blocked keyboard entry).
  const [weightInput, setWeightInput] = useState(() =>
    formData.weightKg !== undefined ? String(formData.weightKg) : ""
  );
  const [heightInput, setHeightInput] = useState(() =>
    formData.heightCm !== undefined ? String(formData.heightCm) : ""
  );

  function handleWeightChange(raw: string) {
    setWeightInput(raw);
    const weightKg = parseOptionalNumber(raw);
    updateFormData({ weightKg });
    setErrors((prev) => {
      const next = { ...prev };
      const err = fieldError("weightKg", weightKg);
      if (err) next.weightKg = err;
      else delete next.weightKg;
      return next;
    });
  }

  function handleHeightChange(raw: string) {
    setHeightInput(raw);
    const heightCm = parseOptionalNumber(raw);
    updateFormData({ heightCm });
    setErrors((prev) => {
      const next = { ...prev };
      const err = fieldError("heightCm", heightCm);
      if (err) next.heightCm = err;
      else delete next.heightCm;
      return next;
    });
  }

  function handleNext() {
    const weightKg = parseOptionalNumber(weightInput);
    const heightCm = parseOptionalNumber(heightInput);
    const validation = step2Schema.safeParse({ weightKg, heightCm });

    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const mapped: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (msgs?.[0]) mapped[key] = msgs[0];
      }
      if (weightKg === undefined) {
        mapped.weightKg = mapped.weightKg ?? "Enter your weight";
      }
      if (heightCm === undefined) {
        mapped.heightCm = mapped.heightCm ?? "Enter your height";
      }
      setErrors(mapped);
      return;
    }

    updateFormData(validation.data);
    setErrors({});
    nextStep();
  }

  const weightNum = parseOptionalNumber(weightInput);
  const heightNum = parseOptionalNumber(heightInput);

  // Only show BMI when both values are within valid schema ranges
  const weightValid =
    weightNum !== undefined &&
    weightNum >= MIN_WEIGHT_KG &&
    weightNum <= MAX_WEIGHT_KG;
  const heightValid =
    heightNum !== undefined &&
    heightNum >= MIN_HEIGHT_CM &&
    heightNum <= MAX_HEIGHT_CM;

  const bmi =
    weightValid && heightValid
      ? weightNum / (heightNum / 100) ** 2
      : null;

  const bmiLabel =
    bmi === null
      ? null
      : bmi < 18.5
        ? "Underweight"
        : bmi < 25
          ? "Normal weight"
          : bmi < 30
            ? "Overweight"
            : "Obese";

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:items-start">
        {/* Weight */}
        <div>
          <label
            htmlFor="onboarding-weight"
            className="block text-sm font-medium text-text-secondary mb-2"
          >
            Current Weight
          </label>
          <div className="relative">
            <input
              id="onboarding-weight"
              type="number"
              inputMode="decimal"
              step="any"
              min={MIN_WEIGHT_KG}
              max={MAX_WEIGHT_KG}
              placeholder={`${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG}`}
              value={weightInput}
              onChange={(e) => handleWeightChange(e.target.value)}
              className={cn(
                "w-full px-4 py-3 pr-12 bg-background border rounded-xl text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                "transition-all",
                errors.weightKg ? "border-red-500" : "border-border"
              )}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">
              kg
            </span>
          </div>
          {errors.weightKg && (
            <p className="mt-1 text-sm text-red-400">{errors.weightKg}</p>
          )}
        </div>

        {/* Height */}
        <div>
          <label
            htmlFor="onboarding-height"
            className="block text-sm font-medium text-text-secondary mb-2"
          >
            Height
          </label>
          <div className="relative">
            <input
              id="onboarding-height"
              type="number"
              inputMode="decimal"
              step="any"
              min={MIN_HEIGHT_CM}
              max={MAX_HEIGHT_CM}
              placeholder={`${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM}`}
              value={heightInput}
              onChange={(e) => handleHeightChange(e.target.value)}
              className={cn(
                "w-full px-4 py-3 pr-12 bg-background border rounded-xl text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                "transition-all",
                errors.heightCm ? "border-red-500" : "border-border"
              )}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">
              cm
            </span>
          </div>
          {errors.heightCm && (
            <p className="mt-1 text-sm text-red-400">{errors.heightCm}</p>
          )}
        </div>

        {/* BMI Preview — full width under inputs on laptop; only when in-range */}
        {bmi !== null && (
          <div className="sm:col-span-2 p-4 lg:p-5 bg-background rounded-xl border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm text-text-muted">Your BMI</p>
              <p className="text-2xl lg:text-3xl font-bold text-text-primary">
                {bmi.toFixed(1)}
              </p>
            </div>
            <p className="text-sm font-medium text-primary sm:text-right">
              {bmiLabel}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <button
          type="button"
          onClick={prevStep}
          className="sm:min-w-[8rem] py-3 px-6 bg-background border border-border text-text-secondary font-semibold rounded-xl hover:bg-surface-hover transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="sm:min-w-[12rem] py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
