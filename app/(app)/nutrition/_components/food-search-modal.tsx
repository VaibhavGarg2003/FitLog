"use client";

/**
 * Food Search Modal — Search and log food items
 * ══════════════════════════════════════════════
 *
 * Appears when user clicks "Add Food" under any meal section.
 * Searches the 150 foods seeded in Step 2 via the food search API.
 *
 * FLOW:
 * 1. User types in search box
 * 2. useFoodSearch hook (Step 2) fires after 2+ characters
 * 3. Results appear with per-serving nutrition preview
 * 4. User selects food → quantity input appears
 * 5. User confirms → useLogFood mutation fires
 * 6. Modal closes → nutrition page + dashboard refresh via cache invalidation
 */

import { useState } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useFoodSearch } from "@/lib/hooks/use-food-search";
import { useLogFood } from "@/lib/hooks/use-nutrition";

interface FoodSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  date: string;
}

export function FoodSearchModal({
  isOpen,
  onClose,
  mealType,
  date,
}: FoodSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<{
    id: string;
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    defaultUnit: string;
    defaultGrams: number;
  } | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [isRestaurant, setIsRestaurant] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const { data: searchResults, isLoading: searching } =
    useFoodSearch(debouncedQuery);
  const logFood = useLogFood(date);

  if (!isOpen) return null;

  const quantityNum = parseFloat(quantity) || 0;
  const previewCalories = selectedFood
    ? Math.round((selectedFood.caloriesPer100g * quantityNum) / 100)
    : 0;

  async function handleLog() {
    if (!selectedFood || quantityNum <= 0) return;

    try {
      await logFood.mutateAsync({
        foodId: selectedFood.id,
        date,
        mealType,
        quantityGrams: quantityNum,
        isRestaurant,
      });
      // Reset and close
      setSelectedFood(null);
      setQuery("");
      setQuantity("100");
      onClose();
    } catch {
      // Error handled by TanStack Query
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-elevated rounded-t-2xl sm:rounded-2xl w-full max-w-lg lg:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-border">
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-bold text-text-primary">
            Add to {mealType.charAt(0) + mealType.slice(1).toLowerCase()}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search food... (e.g., roti, dal, chicken)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedFood(null);
            }}
            autoFocus
            className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedFood ? (
            /* ── Quantity Input (after food is selected) ── */
            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="font-semibold text-text-primary">
                  {selectedFood.name}
                </p>
                <p className="text-sm text-text-muted mt-1">
                  {selectedFood.caloriesPer100g} kcal per 100g
                </p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Quantity (grams)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
                />
                <p className="text-xs text-text-muted mt-1">
                  Default serving: {selectedFood.defaultGrams}g
                  ({selectedFood.defaultUnit})
                </p>
              </div>

              {/* Restaurant toggle */}
              <label className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRestaurant}
                  onChange={(e) => setIsRestaurant(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <div>
                  <p className="text-sm text-text-primary">Restaurant portion</p>
                  <p className="text-xs text-text-muted">
                    ~40-60% more calories than homemade
                  </p>
                </div>
              </label>

              {/* Preview */}
              <div className="bg-surface rounded-xl p-3 border border-border">
                <p className="text-sm text-text-muted">This will log:</p>
                <p className="text-xl font-bold text-primary mt-1">
                  {previewCalories} kcal
                </p>
              </div>

              <button
                type="button"
                onClick={handleLog}
                disabled={logFood.isPending || quantityNum <= 0}
                className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {logFood.isPending ? "Logging..." : "Log Food"}
              </button>
            </div>
          ) : (
            /* ── Search Results ── */
            <div className="space-y-1">
              {searching && (
                <p className="text-sm text-text-muted text-center py-4">
                  Searching...
                </p>
              )}

              {searchResults?.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => {
                    setSelectedFood(food);
                    setQuantity(food.defaultGrams.toString());
                  }}
                  className="w-full p-3 rounded-xl text-left hover:bg-surface-hover transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-text-primary">
                        {food.name}
                      </p>
                      {food.nameHindi && (
                        <p className="text-xs text-text-muted">{food.nameHindi}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold text-text-primary">
                        {food.caloriesPer100g} kcal
                      </p>
                      <p className="text-[10px] text-text-muted">per 100g</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-text-muted">
                    <span>P: {food.proteinPer100g}g</span>
                    <span>C: {food.carbsPer100g}g</span>
                    <span>F: {food.fatPer100g}g</span>
                  </div>
                </button>
              ))}

              {query.length >= 2 && !searching && searchResults?.length === 0 && (
                <p className="text-sm text-text-muted text-center py-4">
                  No foods found for &ldquo;{query}&rdquo;
                </p>
              )}

              {query.length < 2 && (
                <p className="text-sm text-text-muted text-center py-4">
                  Type at least 2 characters to search
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
