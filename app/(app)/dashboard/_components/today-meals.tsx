"use client";

/**
 * Today's Meals Card — Quick Summary of Logged Food
 * ══════════════════════════════════════════════════
 *
 * Shows calories for each meal slot (Breakfast, Lunch, Dinner, Snack).
 * Tapping a meal navigates to the nutrition page for that meal.
 */

import Link from "next/link";

interface MealSummary {
  type: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  calories: number;
  itemCount: number;
}

interface TodayMealsProps {
  meals: MealSummary[];
}

const MEAL_CONFIG = [
  { type: "BREAKFAST" as const, emoji: "🌅", label: "Breakfast" },
  { type: "LUNCH" as const, emoji: "☀️", label: "Lunch" },
  { type: "DINNER" as const, emoji: "🌙", label: "Dinner" },
  { type: "SNACK" as const, emoji: "🍎", label: "Snacks" },
];

export function TodayMeals({ meals }: TodayMealsProps) {
  return (
    <div className="bg-surface rounded-2xl p-5 border border-border space-y-3">
      <div className="flex justify-between items-baseline">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Today&apos;s Meals
        </h3>
        <Link
          href="/nutrition"
          className="text-xs text-primary font-medium hover:underline"
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MEAL_CONFIG.map((config) => {
          const meal = meals.find((m) => m.type === config.type);
          const calories = meal?.calories ?? 0;
          const items = meal?.itemCount ?? 0;

          return (
            <Link
              key={config.type}
              href="/nutrition"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-hover/50 hover:bg-surface-hover transition-colors"
            >
              <span className="text-xl">{config.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs text-text-muted">{config.label}</p>
                <p className="text-sm font-bold text-text-primary">
                  {calories > 0 ? `${calories} kcal` : "—"}
                </p>
                {items > 0 && (
                  <p className="text-[10px] text-text-muted">
                    {items} item{items > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
