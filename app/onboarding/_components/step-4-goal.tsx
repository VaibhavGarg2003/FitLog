"use client";

/**
 * Step 4 — Goal Selection
 * ═══════════════════════
 *
 * 1. User selects a body goal mode in plain language
 * 2. If losing/gaining → enters target weight
 * 3. Selects timeline via a slider (1-12 months)
 * 4. Live preview shows estimated weekly change and calorie target
 * 5. Safety warnings shown if timeline is too aggressive
 *
 * LAYOUT (laptop): goal cards in a 2-column grid; target/timeline/preview
 * in a denser full-width panel so the wide shell feels complete.
 */

import { useState, useMemo } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { cn } from "@/lib/utils/cn";
import {
  calculateBMR,
  calculateTDEE,
  calculateGoalFromTimeline,
} from "@/lib/engine";

// ── Body Goal Modes (plain language, no jargon) ─────────
const BODY_GOALS = [
  {
    id: "lean-cut",
    goal: "LOSE_FAT" as const,
    emoji: "🔥",
    title: "Lean Cut",
    description: "Lose weight and get a lean, toned body",
    deficitRange: "400–600 kcal deficit",
  },
  {
    id: "lean-muscle",
    goal: "RECOMP" as const,
    emoji: "💪",
    title: "Lean Muscle",
    description: "Lose fat while building visible lean muscle",
    deficitRange: "200–400 kcal deficit",
  },
  {
    id: "six-pack",
    goal: "LOSE_FAT" as const,
    emoji: "🎯",
    title: "Six Pack / Abs",
    description: "Get very low body fat with visible abs. Requires discipline.",
    deficitRange: "500–700 kcal deficit",
  },
  {
    id: "bulk",
    goal: "GAIN_MUSCLE" as const,
    emoji: "🏋️",
    title: "Muscle Bulk",
    description: "Gain as much muscle as possible. Some fat gain expected.",
    deficitRange: "200–300 kcal surplus",
  },
  {
    id: "maintain",
    goal: "MAINTAIN" as const,
    emoji: "⚖️",
    title: "Maintain",
    description: "Stay at your current weight and stay consistent",
    deficitRange: "No change",
  },
] as const;

export function Step4Goal() {
  const { formData, updateFormData, nextStep, prevStep } =
    useOnboardingStore();

  const [selectedMode, setSelectedMode] = useState<string>(() => {
    if (formData.goal === "MAINTAIN") return "maintain";
    if (formData.goal === "GAIN_MUSCLE") return "bulk";
    if (formData.goal === "RECOMP") return "lean-muscle";
    if (formData.goal === "LOSE_FAT") return "lean-cut";
    return "";
  });
  const [targetWeight, setTargetWeight] = useState<string>(
    () => formData.targetWeightKg?.toString() ?? ""
  );
  const [timeline, setTimeline] = useState<number>(
    () => formData.timelineMonths ?? 4
  );

  const currentWeight = formData.weightKg ?? 70;
  const selectedGoalObj = BODY_GOALS.find((g) => g.id === selectedMode);
  const needsTarget = selectedMode !== "maintain" && selectedMode !== "";
  const targetWeightNum = parseFloat(targetWeight) || 0;

  const preview = useMemo(() => {
    if (!selectedGoalObj || !needsTarget || !targetWeightNum) return null;
    if (selectedMode === "maintain") return null;

    const sex = formData.sex ?? "MALE";
    const heightCm = formData.heightCm ?? 170;
    const dobStr = formData.dateOfBirth;
    let age = 25;
    if (dobStr) {
      const today = new Date();
      const birth = new Date(dobStr);
      age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    }
    const activityLevel = formData.activityLevel ?? "MODERATE";

    const bmr = calculateBMR(sex, currentWeight, heightCm, age);
    const tdee = calculateTDEE(bmr, activityLevel);

    return calculateGoalFromTimeline({
      currentWeightKg: currentWeight,
      targetWeightKg: targetWeightNum,
      timelineDays: timeline * 30,
      wantsMuscle: selectedMode === "lean-muscle",
      tdee,
      sex,
    });
  }, [
    selectedGoalObj,
    targetWeightNum,
    timeline,
    currentWeight,
    formData,
    selectedMode,
    needsTarget,
  ]);

  function handleModeSelect(modeId: string) {
    setSelectedMode(modeId);
    const goalObj = BODY_GOALS.find((g) => g.id === modeId);
    if (goalObj) {
      updateFormData({ goal: goalObj.goal });
    }
    if (modeId === "maintain") {
      setTargetWeight(currentWeight.toString());
      updateFormData({
        goal: "MAINTAIN",
        targetWeightKg: currentWeight,
        timelineMonths: 1,
      });
    }
  }

  function handleNext() {
    if (!selectedGoalObj) return;

    if (needsTarget && targetWeightNum) {
      updateFormData({
        targetWeightKg: targetWeightNum,
        timelineMonths: timeline,
      });
    }
    nextStep();
  }

  const canContinue =
    selectedMode !== "" &&
    (!needsTarget ||
      (targetWeightNum > 0 && targetWeightNum !== currentWeight));

  return (
    <div className="space-y-5 lg:space-y-6">
      <p className="text-sm text-text-muted">
        Choose how you want to transform your body. We will calculate your
        exact calorie and macro targets based on your choice.
      </p>

      {/* Goal cards — 2 columns on laptop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
        {BODY_GOALS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            id={`onboarding-goal-${mode.id}`}
            onClick={() => handleModeSelect(mode.id)}
            className={cn(
              "w-full p-4 lg:p-5 rounded-xl border-2 text-left transition-all duration-200",
              mode.id === "maintain" && "sm:col-span-2",
              selectedMode === mode.id
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:border-text-muted"
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">{mode.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={cn(
                      "font-semibold",
                      selectedMode === mode.id
                        ? "text-primary"
                        : "text-text-primary"
                    )}
                  >
                    {mode.title}
                  </p>
                  <span className="text-xs text-text-muted bg-surface-hover px-2 py-0.5 rounded-full shrink-0">
                    {mode.deficitRange}
                  </span>
                </div>
                <p className="text-sm text-text-muted mt-1">
                  {mode.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Target Weight + Timeline */}
      {needsTarget && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
            <div>
              <label
                htmlFor="target-weight"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Target Weight (kg)
              </label>
              <input
                id="target-weight"
                type="number"
                inputMode="decimal"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                placeholder={
                  selectedGoalObj?.goal === "GAIN_MUSCLE"
                    ? `e.g., ${currentWeight + 5}`
                    : `e.g., ${Math.max(40, currentWeight - 10)}`
                }
                className="w-full p-3 bg-background border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none transition-colors"
              />
              <p className="text-xs text-text-muted mt-1">
                Current weight: {currentWeight} kg
              </p>
            </div>

            <div>
              <label
                htmlFor="timeline-slider"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Timeline:{" "}
                <span className="text-primary font-bold">
                  {timeline} {timeline === 1 ? "month" : "months"}
                </span>
              </label>
              <input
                id="timeline-slider"
                type="range"
                min={1}
                max={12}
                value={timeline}
                onChange={(e) => setTimeline(parseInt(e.target.value))}
                className="w-full accent-primary mt-3"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>1 month</span>
                <span>6 months</span>
                <span>12 months</span>
              </div>
            </div>
          </div>

          {preview && targetWeightNum > 0 && (
            <div
              className={cn(
                "p-4 lg:p-5 rounded-xl border",
                preview.isSafe
                  ? "bg-primary/5 border-primary/30"
                  : "bg-danger/5 border-danger/30"
              )}
            >
              {preview.isSafe ? (
                <>
                  <p className="text-sm font-semibold text-primary">
                    ✅ Your Plan
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-text-secondary">
                    <div className="rounded-lg bg-background/50 border border-border/60 p-3">
                      <p className="text-xs text-text-muted mb-0.5">
                        Daily calories
                      </p>
                      <p className="font-bold text-text-primary">
                        {preview.targetCalories.toLocaleString()} kcal
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/50 border border-border/60 p-3">
                      <p className="text-xs text-text-muted mb-0.5">
                        Expected change
                      </p>
                      <p className="font-bold text-text-primary">
                        {preview.weeklyChangeKg.toFixed(2)} kg/week
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/50 border border-border/60 p-3">
                      <p className="text-xs text-text-muted mb-0.5">
                        Reach goal in
                      </p>
                      <p className="font-bold text-text-primary">
                        ~{Math.round(preview.estimatedWeeks)} weeks
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-danger">
                    ⚠️ Timeline Too Aggressive
                  </p>
                  <p className="text-sm text-text-secondary mt-1">
                    {preview.warningMessage}
                  </p>
                  <p className="text-xs text-text-muted mt-2">
                    Increase the timeline slider to get a safe plan.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-1">
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
          disabled={!canContinue}
          className={cn(
            "sm:min-w-[12rem] py-3 px-6 font-semibold rounded-xl transition-colors",
            canContinue
              ? "bg-primary text-white hover:bg-primary-hover"
              : "bg-border text-text-muted cursor-not-allowed"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
