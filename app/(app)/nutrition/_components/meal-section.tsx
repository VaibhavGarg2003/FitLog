"use client";

/**
 * Meal Section — One section per meal type (Breakfast, Lunch, etc.)
 * ═════════════════════════════════════════════════════════════════
 *
 * Shows the logged food items for this meal slot and an "Add Food" button.
 * Each food item can be deleted by tapping the × button.
 */

import { useDeleteFood } from "@/lib/hooks/use-nutrition";

interface MealFood {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isRestaurant: boolean;
}

interface MealSectionProps {
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  emoji: string;
  label: string;
  foods: MealFood[];
  date: string;
  onAddFood: () => void;
  onAIInput?: () => void;
  showAIButton?: boolean;
}

export function MealSection({
  mealType,
  emoji,
  label,
  foods,
  date,
  onAddFood,
  onAIInput,
  showAIButton = false,
}: MealSectionProps) {
  const deleteFood = useDeleteFood(date);

  const totalCalories = foods.reduce((sum, f) => sum + f.calories, 0);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden h-full">
      {/* Header */}
      <div className="flex justify-between items-center p-4 lg:px-5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-semibold text-text-primary">{label}</h3>
        </div>
        <span className="text-sm font-bold text-text-secondary">
          {totalCalories > 0 ? `${totalCalories} kcal` : "—"}
        </span>
      </div>

      {/* Food Items */}
      {foods.length > 0 && (
        <div className="divide-y divide-border">
          {foods.map((food) => (
            <div
              key={food.id}
              className="flex items-center justify-between p-3 px-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {food.name}
                  {food.isRestaurant && (
                    <span className="text-[10px] text-warning ml-1">🍽️</span>
                  )}
                </p>
                <p className="text-xs text-text-muted">
                  {food.quantity}{food.unit} • {food.calories} kcal
                </p>
              </div>
              <div className="flex items-center gap-3 ml-2">
                <div className="text-[10px] text-text-muted hidden sm:flex gap-2">
                  <span>P:{Math.round(food.protein)}g</span>
                  <span>C:{Math.round(food.carbs)}g</span>
                  <span>F:{Math.round(food.fat)}g</span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteFood.mutate(food.id)}
                  className="text-text-muted hover:text-danger text-sm transition-colors p-1"
                  disabled={deleteFood.isPending}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex border-t border-border">
        <button
          type="button"
          onClick={onAddFood}
          className="flex-1 p-3 text-sm text-primary font-medium hover:bg-surface-hover transition-colors"
        >
          + Add Food
        </button>
        {showAIButton && onAIInput && (
          <>
            <div className="w-px bg-border" />
            <button
              type="button"
              onClick={onAIInput}
              className="px-4 p-3 text-sm text-accent font-medium hover:bg-surface-hover transition-colors"
            >
              ✨ AI
            </button>
          </>
        )}
      </div>
    </div>
  );
}
