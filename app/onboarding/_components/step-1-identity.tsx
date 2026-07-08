"use client";

import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { step1Schema } from "@/lib/validators/onboarding.schema";
import { cn } from "@/lib/utils/cn";

export function Step1Identity() {
  const { formData, updateFormData, nextStep } = useOnboardingStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleNext() {
    const validation = step1Schema.safeParse({
      name: formData.name,
      dateOfBirth: formData.dateOfBirth,
      sex: formData.sex,
    });

    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const mapped: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (msgs?.[0]) mapped[key] = msgs[0];
      }
      setErrors(mapped);
      return;
    }

    setErrors({});
    nextStep();
  }

  return (
    <div className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          What should we call you?
        </label>
        <input
          id="onboarding-name"
          type="text"
          placeholder="Your name"
          value={formData.name || ""}
          onChange={(e) => updateFormData({ name: e.target.value })}
          className={cn(
            "w-full px-4 py-3 bg-surface border rounded-xl text-text-primary placeholder:text-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "transition-all",
            errors.name ? "border-red-500" : "border-border"
          )}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-400">{errors.name}</p>
        )}
      </div>

      {/* Date of Birth */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Date of Birth
        </label>
        <input
          id="onboarding-dob"
          type="date"
          value={formData.dateOfBirth || ""}
          onChange={(e) => updateFormData({ dateOfBirth: e.target.value })}
          className={cn(
            "w-full px-4 py-3 bg-surface border rounded-xl text-text-primary",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "transition-all [color-scheme:dark]",
            errors.dateOfBirth ? "border-red-500" : "border-border"
          )}
        />
        {errors.dateOfBirth && (
          <p className="mt-1 text-sm text-red-400">{errors.dateOfBirth}</p>
        )}
      </div>

      {/* Biological Sex */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          Biological Sex
        </label>
        <p className="text-xs text-text-muted mb-3">
          Used for accurate BMR calculation. This affects calorie targets.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(["MALE", "FEMALE"] as const).map((sex) => (
            <button
              key={sex}
              type="button"
              id={`onboarding-sex-${sex.toLowerCase()}`}
              onClick={() => updateFormData({ sex })}
              className={cn(
                "p-4 rounded-xl border-2 text-center font-medium transition-all duration-200",
                formData.sex === sex
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-text-secondary hover:border-text-muted"
              )}
            >
              <span className="text-2xl block mb-1">
                {sex === "MALE" ? "♂" : "♀"}
              </span>
              {sex === "MALE" ? "Male" : "Female"}
            </button>
          ))}
        </div>
        {errors.sex && (
          <p className="mt-2 text-sm text-red-400">{errors.sex}</p>
        )}
      </div>

      {/* Next Button */}
      <button
        type="button"
        onClick={handleNext}
        className="w-full py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
