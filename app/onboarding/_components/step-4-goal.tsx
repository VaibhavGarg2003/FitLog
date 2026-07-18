"use client";

/**
 * Step 4 — Goal Selection
 * ═══════════════════════
 *
 * 1. User selects a body goal mode in plain language
 * 2. If losing/gaining → enters target (goal) weight
 * 3. After a valid goal weight, three timeline cards appear:
 *    Minimum / Medium / Maximum — each with daily calories
 * 4. User picks one plan (timeline + calorie budget)
 * 5. Safety: options start at the engine’s minimum safe timeline
 *
 * LAYOUT (laptop): goal cards in a 2-column grid; target weight full-width;
 * timeline choices as selectable plan cards under the weight field.
 */

import { useState, useMemo, useEffect } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { cn } from "@/lib/utils/cn";
import { step4Schema } from "@/lib/validators/onboarding.schema";
import {
  calculateBMR,
  calculateTDEE,
  calculateGoalFromTimeline,
} from "@/lib/engine";

/** Schema bounds — used for range checks and placeholder hints. */
const MIN_TARGET_WEIGHT_KG = 30;
const MAX_TARGET_WEIGHT_KG = 300;
const MAX_TIMELINE_MONTHS = 24;
const DAYS_PER_MONTH = 30;

type TimelineTierId = "minimum" | "medium" | "maximum";

type TimelineOption = {
  id: TimelineTierId;
  label: string;
  subtitle: string;
  months: number;
  targetCalories: number;
  weeklyChangeKg: number;
  estimatedWeeks: number;
  isSafe: boolean;
};

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

/** Real-time field error from Zod step4Schema for targetWeightKg. */
function targetWeightError(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const validation = step4Schema.safeParse({
    goal: "LOSE_FAT",
    targetWeightKg: value,
  });
  if (validation.success) return undefined;
  return validation.error.flatten().fieldErrors.targetWeightKg?.[0];
}

function ageFromDob(dobStr: string | undefined): number {
  if (!dobStr) return 25;
  const today = new Date();
  const birth = new Date(dobStr);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Shortest safe timeline in whole months for this weight change.
 * Uses the same engine guards as the single-timeline calculator.
 */
function minSafeTimelineMonths(input: {
  currentWeightKg: number;
  targetWeightKg: number;
  wantsMuscle: boolean;
  tdee: number;
  bmr: number;
  sex: "MALE" | "FEMALE";
}): { months: number; unreachable: boolean; message?: string } {
  const {
    currentWeightKg,
    targetWeightKg,
    wantsMuscle,
    tdee,
    bmr,
    sex,
  } = input;
  const delta = currentWeightKg - targetWeightKg;

  if (Math.abs(delta) < 0.5) {
    return { months: 1, unreachable: false };
  }

  // Gain: engine safety is ≤ 0.5 kg/week
  if (delta < 0) {
    const weightToGain = Math.abs(delta);
    const minDays = Math.ceil((weightToGain / 0.5) * 7);
    const months = Math.min(
      MAX_TIMELINE_MONTHS,
      Math.max(1, Math.ceil(minDays / DAYS_PER_MONTH))
    );
    return { months, unreachable: false };
  }

  // Loss: probe a 1-week plan — if unsafe, engine returns safeTimelineDays
  const probe = calculateGoalFromTimeline({
    currentWeightKg,
    targetWeightKg,
    timelineDays: 7,
    wantsMuscle,
    tdee,
    bmr,
    sex,
  });

  if (probe.isSafe) {
    return { months: 1, unreachable: false };
  }

  if (probe.safeTimelineDays == null || !Number.isFinite(probe.safeTimelineDays)) {
    return {
      months: MAX_TIMELINE_MONTHS,
      unreachable: true,
      message: probe.warningMessage,
    };
  }

  const months = Math.min(
    MAX_TIMELINE_MONTHS,
    Math.max(1, Math.ceil(probe.safeTimelineDays / DAYS_PER_MONTH))
  );
  return { months, unreachable: false, message: probe.warningMessage };
}

/** Build Minimum / Medium / Maximum month options with calorie previews. */
function buildTimelineOptions(input: {
  currentWeightKg: number;
  targetWeightKg: number;
  wantsMuscle: boolean;
  tdee: number;
  bmr: number;
  sex: "MALE" | "FEMALE";
}): { options: TimelineOption[]; unreachableMessage?: string } {
  const min = minSafeTimelineMonths(input);
  if (min.unreachable) {
    return { options: [], unreachableMessage: min.message };
  }

  const monthCandidates = [
    min.months,
    Math.min(MAX_TIMELINE_MONTHS, min.months + 1),
    Math.min(MAX_TIMELINE_MONTHS, min.months + 2),
  ];
  // De-dupe if we hit the 24-month ceiling
  const uniqueMonths = [...new Set(monthCandidates)];

  const tiers: { id: TimelineTierId; label: string; subtitle: string }[] = [
    {
      id: "minimum",
      label: "Minimum",
      subtitle: "Fastest safe pace · lower daily calories",
    },
    {
      id: "medium",
      label: "Medium",
      subtitle: "Balanced pace · moderate daily calories",
    },
    {
      id: "maximum",
      label: "Maximum",
      subtitle: "Easiest pace · higher daily calories",
    },
  ];

  const options: TimelineOption[] = uniqueMonths.map((months, i) => {
    const tier = tiers[Math.min(i, tiers.length - 1)];
    const plan = calculateGoalFromTimeline({
      ...input,
      timelineDays: months * DAYS_PER_MONTH,
    });
    return {
      id: tier.id,
      label: tier.label,
      subtitle: tier.subtitle,
      months,
      targetCalories: plan.targetCalories,
      weeklyChangeKg: plan.weeklyChangeKg,
      estimatedWeeks: plan.estimatedWeeks,
      isSafe: plan.isSafe,
    };
  }).filter((o) => o.isSafe);

  return { options };
}

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
  const [targetWeight, setTargetWeight] = useState<string>(() =>
    formData.targetWeightKg !== undefined
      ? String(formData.targetWeightKg)
      : ""
  );
  /** Selected plan months — undefined until user picks a timeline card. */
  const [selectedMonths, setSelectedMonths] = useState<number | undefined>(
    () => formData.timelineMonths
  );
  const [targetWeightFieldError, setTargetWeightFieldError] = useState<
    string | undefined
  >(() => targetWeightError(formData.targetWeightKg));

  const currentWeight = formData.weightKg ?? 70;
  const selectedGoalObj = BODY_GOALS.find((g) => g.id === selectedMode);
  const needsTarget = selectedMode !== "maintain" && selectedMode !== "";
  // Parsed value only — never clamp while typing (that blocked keyboard entry).
  const targetWeightNum = parseOptionalNumber(targetWeight);
  const targetWeightInRange =
    targetWeightNum !== undefined &&
    targetWeightNum >= MIN_TARGET_WEIGHT_KG &&
    targetWeightNum <= MAX_TARGET_WEIGHT_KG;
  const targetWeightReady =
    targetWeightInRange &&
    targetWeightNum !== currentWeight &&
    !targetWeightFieldError;

  function handleTargetWeightChange(raw: string) {
    // Keep the raw string so the user can clear, retype, and enter intermediates.
    setTargetWeight(raw);
    const n = parseOptionalNumber(raw);

    if (n === undefined) {
      setTargetWeightFieldError(undefined);
      setSelectedMonths(undefined);
      updateFormData({ targetWeightKg: undefined, timelineMonths: undefined });
      return;
    }

    const rangeErr = targetWeightError(n);
    setTargetWeightFieldError(
      rangeErr ??
        (n === currentWeight
          ? "Target weight must differ from your current weight"
          : undefined)
    );
    // Changing goal weight invalidates the previous timeline choice.
    setSelectedMonths(undefined);
    updateFormData({ targetWeightKg: n, timelineMonths: undefined });
  }

  const engineContext = useMemo(() => {
    const sex = formData.sex ?? "MALE";
    const heightCm = formData.heightCm ?? 170;
    const age = ageFromDob(formData.dateOfBirth);
    const activityLevel = formData.activityLevel ?? "MODERATE";
    const bmr = calculateBMR(sex, currentWeight, heightCm, age);
    const tdee = calculateTDEE(bmr, activityLevel);
    return {
      sex: sex as "MALE" | "FEMALE",
      bmr,
      tdee,
      wantsMuscle: selectedMode === "lean-muscle",
    };
  }, [formData.sex, formData.heightCm, formData.dateOfBirth, formData.activityLevel, currentWeight, selectedMode]);

  const { options: timelineOptions, unreachableMessage } = useMemo(() => {
    if (!needsTarget || !targetWeightReady || targetWeightNum === undefined) {
      return { options: [] as TimelineOption[] };
    }
    return buildTimelineOptions({
      currentWeightKg: currentWeight,
      targetWeightKg: targetWeightNum,
      wantsMuscle: engineContext.wantsMuscle,
      tdee: engineContext.tdee,
      bmr: engineContext.bmr,
      sex: engineContext.sex,
    });
  }, [
    needsTarget,
    targetWeightReady,
    targetWeightNum,
    currentWeight,
    engineContext,
  ]);

  // If restored months no longer match available options, clear the selection.
  // Local state: adjusted DURING RENDER (React's sanctioned pattern for
  // derived resets — guarded, so it re-renders once instead of cascading).
  const selectionInvalid =
    selectedMonths !== undefined &&
    timelineOptions.length > 0 &&
    !timelineOptions.some((o) => o.months === selectedMonths);
  if (selectionInvalid) {
    setSelectedMonths(undefined);
  }

  // Store sync: keyed off the STORE value (not local state) so it still fires
  // after the render-phase reset above. Zustand is an external system — this
  // is exactly what effects are for.
  const storedMonths = formData.timelineMonths;
  useEffect(() => {
    if (
      storedMonths !== undefined &&
      timelineOptions.length > 0 &&
      !timelineOptions.some((o) => o.months === storedMonths)
    ) {
      updateFormData({ timelineMonths: undefined });
    }
  }, [timelineOptions, storedMonths, updateFormData]);

  const selectedOption = timelineOptions.find(
    (o) => o.months === selectedMonths
  );

  function handleModeSelect(modeId: string) {
    setSelectedMode(modeId);
    const goalObj = BODY_GOALS.find((g) => g.id === modeId);
    if (goalObj) {
      updateFormData({ goal: goalObj.goal });
    }
    if (modeId === "maintain") {
      setTargetWeight(currentWeight.toString());
      setTargetWeightFieldError(undefined);
      setSelectedMonths(undefined);
      updateFormData({
        goal: "MAINTAIN",
        targetWeightKg: currentWeight,
        timelineMonths: 1,
      });
    } else if (
      formData.targetWeightKg === undefined ||
      targetWeight === "" ||
      targetWeight === String(currentWeight)
    ) {
      // First time opening a goal that needs a target: start empty so the user
      // deliberately types their goal weight before timeline options appear.
      const hasCustomTarget =
        formData.targetWeightKg !== undefined &&
        formData.targetWeightKg !== currentWeight &&
        formData.goal !== "MAINTAIN";
      if (!hasCustomTarget) {
        setTargetWeight("");
        setTargetWeightFieldError(undefined);
        setSelectedMonths(undefined);
        updateFormData({ targetWeightKg: undefined, timelineMonths: undefined });
      }
    }
  }

  function handleTimelineSelect(option: TimelineOption) {
    setSelectedMonths(option.months);
    updateFormData({ timelineMonths: option.months });
  }

  function handleNext() {
    if (!selectedGoalObj) return;

    if (needsTarget) {
      if (targetWeightNum === undefined) {
        setTargetWeightFieldError("Enter a target weight");
        return;
      }
      const err = targetWeightError(targetWeightNum);
      if (err) {
        setTargetWeightFieldError(err);
        return;
      }
      if (targetWeightNum === currentWeight) {
        setTargetWeightFieldError(
          "Target weight must differ from your current weight"
        );
        return;
      }
      if (selectedMonths === undefined) {
        return;
      }
      updateFormData({
        targetWeightKg: targetWeightNum,
        timelineMonths: selectedMonths,
      });
    }
    nextStep();
  }

  // Skip the target weight: keep the chosen goal MODE (the engine needs it for
  // calorie/protein targets) but clear any target so NO goal row is created.
  // The dashboard then shows the goal type without a progress bar.
  function handleSkipTarget() {
    if (!selectedGoalObj) return;
    setSelectedMonths(undefined);
    updateFormData({ targetWeightKg: undefined, timelineMonths: undefined });
    nextStep();
  }

  // Must pick a goal; if a target is required, weight + a timeline card are required.
  const canContinue =
    selectedMode !== "" &&
    (selectedMode === "maintain" ||
      (targetWeightReady &&
        selectedMonths !== undefined &&
        selectedOption?.isSafe === true));

  const canSkipTarget = selectedMode !== "";

  return (
    <div className="space-y-5 lg:space-y-6">
      <p className="text-sm text-text-muted">
        Choose how you want to transform your body. Set your goal weight, then
        pick a timeline — we&apos;ll show the daily calories for each option.
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

      {/* 1) Goal weight — only after a non-maintain mode is chosen */}
      {needsTarget && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div>
            <label
              htmlFor="target-weight"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Goal weight (kg)
            </label>
            <div className="relative max-w-md">
              <input
                id="target-weight"
                type="number"
                inputMode="decimal"
                step="any"
                min={MIN_TARGET_WEIGHT_KG}
                max={MAX_TARGET_WEIGHT_KG}
                value={targetWeight}
                onChange={(e) => handleTargetWeightChange(e.target.value)}
                placeholder={`${MIN_TARGET_WEIGHT_KG}–${MAX_TARGET_WEIGHT_KG}`}
                className={cn(
                  "w-full p-3 pr-12 bg-background border rounded-xl text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                  "transition-all",
                  targetWeightFieldError ? "border-red-500" : "border-border"
                )}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">
                kg
              </span>
            </div>
            {targetWeightFieldError ? (
              <p className="mt-1 text-sm text-red-400">
                {targetWeightFieldError}
              </p>
            ) : (
              <p className="text-xs text-text-muted mt-1">
                Current weight: {currentWeight} kg
              </p>
            )}
          </div>

          {/* 2) Timeline choices — only after a valid goal weight */}
          {targetWeightReady && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-text-secondary">
                  Choose your timeline
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Each plan shows how long it takes and how many calories you
                  should eat per day. Pick the one that fits your lifestyle.
                </p>
              </div>

              {unreachableMessage && timelineOptions.length === 0 ? (
                <div className="p-4 rounded-xl border border-danger/30 bg-danger/5">
                  <p className="text-sm font-semibold text-danger">
                    ⚠️ This goal isn&apos;t reachable safely on diet alone
                  </p>
                  <p className="text-sm text-text-secondary mt-1">
                    {unreachableMessage}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {timelineOptions.map((option) => {
                    const isSelected = selectedMonths === option.months;
                    // Engine returns a positive weeklyChangeKg for both loss and gain
                    // (magnitude only); direction comes from goal vs current weight.
                    const isGain =
                      targetWeightNum !== undefined &&
                      targetWeightNum > currentWeight;
                    const weeklyAbs = Math.abs(option.weeklyChangeKg);
                    const weeklyLabel =
                      weeklyAbs < 0.005
                        ? "0 kg/week"
                        : `${isGain ? "+" : "−"}${weeklyAbs.toFixed(2)} kg/week`;
                    return (
                      <button
                        key={`${option.id}-${option.months}`}
                        type="button"
                        id={`onboarding-timeline-${option.id}`}
                        onClick={() => handleTimelineSelect(option)}
                        className={cn(
                          "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                            : "border-border bg-background hover:border-text-muted"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              isSelected ? "text-primary" : "text-text-primary"
                            )}
                          >
                            {option.label}
                          </p>
                          {isSelected && (
                            <span className="text-xs font-medium text-primary">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-2xl font-bold text-text-primary tabular-nums">
                          {option.months}{" "}
                          <span className="text-base font-semibold text-text-secondary">
                            {option.months === 1 ? "month" : "months"}
                          </span>
                        </p>
                        <div className="mt-3 rounded-lg bg-background/80 border border-border/60 p-3">
                          <p className="text-xs text-text-muted">
                            Daily calories
                          </p>
                          <p className="text-lg font-bold text-primary tabular-nums">
                            {option.targetCalories.toLocaleString()}{" "}
                            <span className="text-sm font-semibold">kcal</span>
                          </p>
                        </div>
                        <p className="mt-2 text-xs text-text-muted">
                          {weeklyLabel} · ~
                          {Math.round(option.estimatedWeeks)} weeks
                        </p>
                        <p className="mt-1 text-xs text-text-muted/80">
                          {option.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedOption && (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
                  <p className="text-sm font-semibold text-primary">
                    ✅ Your plan
                  </p>
                  <p className="text-sm text-text-secondary mt-1">
                    Reach{" "}
                    <span className="font-semibold text-text-primary">
                      {targetWeightNum} kg
                    </span>{" "}
                    in about{" "}
                    <span className="font-semibold text-text-primary">
                      {selectedOption.months}{" "}
                      {selectedOption.months === 1 ? "month" : "months"}
                    </span>{" "}
                    while eating{" "}
                    <span className="font-semibold text-text-primary">
                      {selectedOption.targetCalories.toLocaleString()} kcal
                    </span>{" "}
                    per day.
                  </p>
                </div>
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

      {/* Skip target — only shown once a goal mode is picked and a target is
          expected. Proceeds without creating a goal; user can set one later. */}
      {canSkipTarget && needsTarget && (
        <div className="text-center">
          <button
            type="button"
            onClick={handleSkipTarget}
            className="text-sm text-text-muted hover:text-text-secondary underline underline-offset-2 transition-colors"
          >
            Skip — I&apos;ll set a target weight later
          </button>
        </div>
      )}
    </div>
  );
}
