"use client";

/**
 * Nutrition Page — Daily Food Logger
 * ═══════════════════════════════════
 *
 * Shows all meals for the selected date organized by meal type.
 * Each meal section has "Add Food" (search) and "AI ✨" (text) buttons.
 *
 * DATA FLOW:
 * ──────────
 * selectedDate (ui-store.ts — Step 1)
 *   → useDailySummary (Step 3 hook) → summary bar (total kcal, macros)
 *   → useMealsForDate (Step 3 hook) → meal sections (individual foods)
 *
 * WHY TWO HOOKS?
 * ──────────────
 * useDailySummary → GET /api/nutrition/daily → aggregate totals only (fast)
 * useMealsForDate → GET /api/nutrition/daily?full=true → full meal + food rows
 * The dashboard uses only totals. The nutrition page needs both.
 */

import { useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useDailySummary } from "@/lib/hooks/use-daily-summary";
import { useMealsForDate } from "@/lib/hooks/use-nutrition";
import { DateStrip } from "../dashboard/_components/date-strip";
import { MealSection } from "./_components/meal-section";
import { FoodSearchModal } from "./_components/food-search-modal";
import { AIMealInput } from "./_components/ai-meal-input";

const MEALS = [
  { type: "BREAKFAST" as const, emoji: "🌅", label: "Breakfast" },
  { type: "LUNCH" as const, emoji: "☀️", label: "Lunch" },
  { type: "DINNER" as const, emoji: "🌙", label: "Dinner" },
  { type: "SNACK" as const, emoji: "🍎", label: "Snacks" },
];

export default function NutritionPage() {
  const selectedDate = useUIStore((s) => s.selectedDate);

  // Summary bar totals (fast aggregate query)
  const { data: daily } = useDailySummary(selectedDate);

  // Full meal list with individual food items (for MealSection cards)
  const { data: meals } = useMealsForDate(selectedDate);

  const [searchModal, setSearchModal] = useState<{
    isOpen: boolean;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  }>({
    isOpen: false,
    mealType: "BREAKFAST",
  });

  // AI input state — tracks which meal type has the AI input open
  const [aiInputMeal, setAiInputMeal] = useState<
    "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" | null
  >(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Nutrition
        </h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Track what you eat today
        </p>
      </div>

      {/* Date Selector — shared with dashboard */}
      <DateStrip />

      {/* Daily Summary Bar */}
      {daily && (
        <div className="bg-surface rounded-xl p-3 border border-border flex justify-between text-center">
          <div>
            <p className="text-lg font-bold text-text-primary">
              {daily.totalCalories}
            </p>
            <p className="text-[10px] text-text-muted">kcal</p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--color-protein)" }}>
              {daily.totalProtein}g
            </p>
            <p className="text-[10px] text-text-muted">protein</p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--color-carbs)" }}>
              {daily.totalCarbs}g
            </p>
            <p className="text-[10px] text-text-muted">carbs</p>
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--color-fat)" }}>
              {daily.totalFat}g
            </p>
            <p className="text-[10px] text-text-muted">fat</p>
          </div>
        </div>
      )}

      {/* Meal Sections — stacked on mobile, 2-column grid on desktop.
          Each meal (section + its slide-open AI input) is one grid cell. */}
      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
        {MEALS.map((meal) => {
          // Find the meal entry for this meal type from the fetched meals
          const entry = meals?.find((m) => m.mealType === meal.type);
          // Get foods for this meal type (or empty array if none logged yet)
          const foods = entry?.mealFoods ?? [];

          return (
            <div key={meal.type} className="space-y-2">
              <MealSection
                mealType={meal.type}
                emoji={meal.emoji}
                label={meal.label}
                foods={foods}
                date={selectedDate}
                onAddFood={() =>
                  setSearchModal({ isOpen: true, mealType: meal.type })
                }
                onAIInput={() =>
                  setAiInputMeal(
                    aiInputMeal === meal.type ? null : meal.type
                  )
                }
                showAIButton={true}
              />

              {/* AI Input — slides open below the meal section */}
              {aiInputMeal === meal.type && (
                <AIMealInput
                  date={selectedDate}
                  mealType={meal.type}
                  onClose={() => setAiInputMeal(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Food Search Modal */}
      <FoodSearchModal
        isOpen={searchModal.isOpen}
        onClose={() => setSearchModal({ ...searchModal, isOpen: false })}
        mealType={searchModal.mealType}
        date={selectedDate}
      />
    </div>
  );
}


