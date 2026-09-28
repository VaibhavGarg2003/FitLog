"use client";

/**
 * Insight Plan picker + AI data notice
 * ════════════════════════════════════
 *
 * Shared by onboarding (step 5) and Settings → Coach check-ins, so both show
 * the same choices and the same disclosure.
 *
 *   WEEKLY_AND_MONTHLY — a report for each finished week + a monthly review
 *   MONTHLY_ONLY       — the monthly review only
 *
 * Quarterly and yearly reviews appear for everyone once there is enough data;
 * the numbers on the Progress page never need the AI.
 */

import { cn } from "@/lib/utils/cn";

export type InsightPlan = "WEEKLY_AND_MONTHLY" | "MONTHLY_ONLY";

const OPTIONS: Array<{ value: InsightPlan; emoji: string; title: string; description: string }> = [
  {
    value: "WEEKLY_AND_MONTHLY",
    emoji: "🗓️",
    title: "Weekly + monthly",
    description: "A short report after each week, plus a monthly review",
  },
  {
    value: "MONTHLY_ONLY",
    emoji: "📅",
    title: "Monthly only",
    description: "One review after each month — fewer check-ins",
  },
];

export function InsightPlanPicker({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: InsightPlan;
  onChange: (plan: InsightPlan) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          id={`${idPrefix}-${opt.value.toLowerCase().replaceAll("_", "-")}`}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={cn(
            "w-full p-3 lg:p-4 rounded-xl border-2 text-left transition-all duration-200 flex items-center gap-3 disabled:opacity-60",
            value === opt.value
              ? "border-primary bg-primary/10"
              : "border-border bg-background hover:border-text-muted"
          )}
        >
          <span className="text-xl">{opt.emoji}</span>
          <span>
            <span
              className={cn(
                "block font-medium text-sm",
                value === opt.value ? "text-primary" : "text-text-primary"
              )}
            >
              {opt.title}
            </span>
            <span className="block text-xs text-text-muted mt-0.5">{opt.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** What leaves the app when a report is written — shown wherever the plan is chosen. */
export function AiDataNotice() {
  return (
    <p className="text-xs text-text-muted leading-relaxed">
      🔒 Reports are written only when you tap &ldquo;Write my review&rdquo;. We then send
      a summary of that period — daily/weekly totals and averages, weight trend,
      top lifts, your goal, diet type and feedback style — to an AI provider
      (Google Gemini, Groq or OpenRouter). Your name, email and the individual
      foods you logged are not sent.
    </p>
  );
}
