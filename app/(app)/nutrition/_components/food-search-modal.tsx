"use client";

/**
 * Food Search Modal — Search and log food items
 * ══════════════════════════════════════════════
 *
 * Appears when user clicks "Add Food" under any meal section.
 *
 * THREE WAYS TO GET A FOOD, in order of preference:
 * ─────────────────────────────────────────────────
 * 1. The seeded table          — verified data, one lookup
 * 2. The user's own saved food — their tub's actual macros (shown FIRST)
 * 3. AI, for anything else     — "momos" isn't in the table and never will be
 *
 * WHY (3) MATTERS: the table holds a few hundred foods; the world holds more.
 * A dead-end "No foods found" made the app look broken when the AI parser that
 * could answer it was already wired up one component away. Now the empty state
 * IS the offer — one tap sends the query straight to the parser.
 *
 * CUSTOM FOODS CANNOT BE LOGGED BY ID:
 * ────────────────────────────────────
 * `MealFood.foodId` is a foreign key into the seeded `foods` table, so a custom
 * food's id would violate it. They log through the by-name path instead (name +
 * pre-computed macros), the same route the AI parser uses for unmatched foods.
 */

import { useState } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useFoodSearch, type FoodResult } from "@/lib/hooks/use-food-search";
import { useLogFood } from "@/lib/hooks/use-nutrition";
import { useAIMealParser } from "@/lib/hooks/use-ai-meal-parser";
import { CustomFoodForm } from "./custom-food-form";

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
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);
  const [quantity, setQuantity] = useState("100");
  // Scoop-based supplements (whey, casein, gainer...) are logged by SCOOPS,
  // not grams — nobody eats 100g of protein powder. `scoops` × `scoopGrams`
  // gives the grams we actually store, and scoopGrams is editable because a
  // scoop is 25-40g depending on the brand.
  const [scoops, setScoops] = useState("1");
  const [scoopGrams, setScoopGrams] = useState("30");
  const [isRestaurant, setIsRestaurant] = useState(false);
  const [editingMacros, setEditingMacros] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const { data: searchResults, isLoading: searching } =
    useFoodSearch(debouncedQuery);
  const logFood = useLogFood(date);
  const aiParser = useAIMealParser(date);

  if (!isOpen) return null;

  // A "scoop" food thinks in scoops; everything else thinks in grams.
  const isScoopFood = selectedFood?.defaultUnit === "scoop";
  const scoopGramsNum = parseFloat(scoopGrams) || 0;
  const scoopsNum = parseFloat(scoops) || 0;
  // Grams to actually log — the one number the DB and macros are computed from.
  const quantityNum = isScoopFood
    ? scoopsNum * scoopGramsNum
    : parseFloat(quantity) || 0;
  const previewCalories = selectedFood
    ? Math.round((selectedFood.caloriesPer100g * quantityNum) / 100)
    : 0;

  /** Scale a per-100g figure to `grams`, rounded to 1 dp. */
  const per = (per100g: number, grams: number) =>
    Math.round((per100g * grams) / 100 * 10) / 10;

  /** Select a food and seed the right serving default for its unit. */
  function selectFood(food: FoodResult) {
    setSelectedFood(food);
    setLogError(null);
    if (food.defaultUnit === "scoop") {
      setScoops("1");
      setScoopGrams(String(food.defaultGrams || 30));
    } else {
      setQuantity(String(food.defaultGrams));
    }
  }

  function resetAndClose() {
    setSelectedFood(null);
    setQuery("");
    setQuantity("100");
    setScoops("1");
    setScoopGrams("30");
    setIsRestaurant(false);
    setEditingMacros(false);
    setLogError(null);
    aiParser.reset();
    onClose();
  }

  async function handleLog() {
    if (!selectedFood || quantityNum <= 0) return;
    setLogError(null);

    // A custom food has no row in `foods`, so it cannot be logged by id — send
    // the name and the macros worked out for this serving instead.
    const payload = selectedFood.isCustom
      ? {
          date,
          mealType,
          name: selectedFood.name,
          quantity: quantityNum,
          unit: "g",
          calories: Math.round(
            (selectedFood.caloriesPer100g * quantityNum) / 100
          ),
          protein:
            Math.round(selectedFood.proteinPer100g * quantityNum) / 100,
          carbs: Math.round(selectedFood.carbsPer100g * quantityNum) / 100,
          fat: Math.round(selectedFood.fatPer100g * quantityNum) / 100,
        }
      : {
          foodId: selectedFood.id,
          date,
          mealType,
          quantityGrams: quantityNum,
          isRestaurant,
        };

    try {
      await logFood.mutateAsync(payload);
      resetAndClose();
    } catch {
      setLogError("Could not log this food. Try again.");
    }
  }

  /** Hand the raw search text to the AI parser and log whatever it returns. */
  function handleParseWithAI() {
    const text = query.trim();
    if (text.length < 2) return;
    aiParser.mutate(
      { text, mealType, date },
      { onSuccess: () => setTimeout(resetAndClose, 2200) }
    );
  }

  const showEmptyState =
    query.length >= 2 &&
    !searching &&
    searchResults?.length === 0 &&
    !aiParser.isPending &&
    !aiParser.isSuccess;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={resetAndClose}
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
            onClick={resetAndClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Search Input — hidden while editing macros, which is its own task */}
        {!editingMacros && (
          <div className="p-4 border-b border-border">
            <input
              type="text"
              placeholder="Search food... (e.g., roti, dal, chicken)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedFood(null);
                aiParser.reset();
              }}
              autoFocus
              className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {editingMacros && selectedFood ? (
            /* ── Custom macros editor ── */
            <CustomFoodForm
              initial={selectedFood}
              isExisting={selectedFood.isCustom}
              onSaved={(saved) => {
                // Continue straight into logging the food just saved, seeding
                // the correct serving default for its unit (scoop vs grams).
                selectFood({
                  ...saved,
                  nameHindi: null,
                  defaultQuantity: 1,
                  restaurantMultiplier: 1,
                  source: "CUSTOM",
                  isCustom: true,
                });
                setEditingMacros(false);
              }}
              onCancel={() => setEditingMacros(false)}
              onDeleted={() => {
                setEditingMacros(false);
                setSelectedFood(null);
              }}
            />
          ) : selectedFood ? (
            /* ── Quantity Input (after food is selected) ── */
            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">
                      {selectedFood.name}
                    </p>
                    {/* Scoop foods quote PER SCOOP — the unit people think in;
                        everything else stays per 100g. */}
                    {isScoopFood ? (
                      <p className="text-sm text-text-muted mt-1">
                        {per(selectedFood.caloriesPer100g, scoopGramsNum)} kcal
                        per scoop ({scoopGramsNum || "?"}g) · P{" "}
                        {per(selectedFood.proteinPer100g, scoopGramsNum)}g · C{" "}
                        {per(selectedFood.carbsPer100g, scoopGramsNum)}g · F{" "}
                        {per(selectedFood.fatPer100g, scoopGramsNum)}g
                      </p>
                    ) : (
                      <p className="text-sm text-text-muted mt-1">
                        {selectedFood.caloriesPer100g} kcal per 100g · P{" "}
                        {selectedFood.proteinPer100g}g · C{" "}
                        {selectedFood.carbsPer100g}g · F {selectedFood.fatPer100g}g
                      </p>
                    )}
                  </div>
                  {selectedFood.isCustom && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded">
                      Yours
                    </span>
                  )}
                </div>

                {/* The escape hatch from generic data — prominent, because for
                    protein powder the generic average (concentrate vs isolate
                    moves protein ~75g→90g) is wrong for most people. */}
                <button
                  type="button"
                  onClick={() => setEditingMacros(true)}
                  className="mt-3 text-xs font-medium text-primary hover:underline"
                >
                  {selectedFood.isCustom
                    ? "Edit these macros"
                    : isScoopFood
                    ? "Concentrate, isolate, or another brand? Enter your macros →"
                    : "Not your brand? Save your own macros →"}
                </button>
              </div>

              {isScoopFood ? (
                /* ── Scoop entry: scoops × grams-per-scoop ── */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="fs-scoops"
                        className="block text-sm text-text-secondary mb-1"
                      >
                        Scoops
                      </label>
                      <input
                        id="fs-scoops"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={scoops}
                        onChange={(e) => setScoops(e.target.value)}
                        className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fs-scoop-g"
                        className="block text-sm text-text-secondary mb-1"
                      >
                        Grams per scoop
                      </label>
                      <input
                        id="fs-scoop-g"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={scoopGrams}
                        onChange={(e) => setScoopGrams(e.target.value)}
                        className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  {/* One-tap common scoop sizes — the value is on the tub. */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Scoop size:</span>
                    {[25, 30, 35, 40].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setScoopGrams(String(g))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          scoopGramsNum === g
                            ? "bg-primary text-white border-primary"
                            : "bg-surface border-border text-text-secondary hover:border-primary"
                        }`}
                      >
                        {g}g
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">
                    Check your tub — a scoop is usually 25–40g. Logs{" "}
                    {quantityNum > 0 ? Math.round(quantityNum) : "—"}g total.
                  </p>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="fs-qty"
                    className="block text-sm text-text-secondary mb-1"
                  >
                    Quantity (grams)
                  </label>
                  <input
                    id="fs-qty"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Default serving: {selectedFood.defaultGrams}g (
                    {selectedFood.defaultUnit})
                  </p>
                </div>
              )}

              {/* Restaurant toggle — meaningless for a scoop of powder */}
              {!selectedFood.isCustom && !isScoopFood && (
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
              )}

              {/* Preview */}
              <div className="bg-surface rounded-xl p-3 border border-border">
                <p className="text-sm text-text-muted">This will log:</p>
                <p className="text-xl font-bold text-primary mt-1">
                  {previewCalories} kcal
                </p>
              </div>

              {logError && <p className="text-sm text-red-400">{logError}</p>}

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

              {searchResults?.map((food) => {
                // Scoop foods are previewed per scoop in the list too, so the
                // number matches what actually gets logged.
                const scoop = food.defaultUnit === "scoop";
                const g = scoop ? food.defaultGrams : 100;
                return (
                  <button
                    key={`${food.isCustom ? "custom" : "db"}-${food.id}`}
                    type="button"
                    onClick={() => selectFood(food)}
                    className="w-full p-3 rounded-xl text-left hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary flex items-center gap-2">
                          <span className="truncate">{food.name}</span>
                          {food.isCustom && (
                            <span className="shrink-0 text-[9px] uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                              Yours
                            </span>
                          )}
                        </p>
                        {food.nameHindi && (
                          <p className="text-xs text-text-muted">{food.nameHindi}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-text-primary">
                          {per(food.caloriesPer100g, g)} kcal
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {scoop ? `per scoop (${g}g)` : "per 100g"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-text-muted">
                      <span>P: {per(food.proteinPer100g, g)}g</span>
                      <span>C: {per(food.carbsPer100g, g)}g</span>
                      <span>F: {per(food.fatPer100g, g)}g</span>
                    </div>
                  </button>
                );
              })}

              {/* ── Not in the table? Let the AI price it. ── */}
              {showEmptyState && (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-text-secondary">
                    &ldquo;{query}&rdquo; isn&apos;t in our food table.
                  </p>
                  <button
                    type="button"
                    onClick={handleParseWithAI}
                    className="mx-auto px-5 py-3 bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all"
                  >
                    ✨ Estimate &ldquo;{query}&rdquo; with AI
                  </button>
                  <p className="text-xs text-text-muted max-w-xs mx-auto">
                    AI works out the macros and logs it straight to this meal.
                    Add an amount for a closer estimate — try &ldquo;{query}, 6
                    pieces&rdquo;.
                  </p>
                </div>
              )}

              {aiParser.isPending && (
                <div className="py-6 space-y-2">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-10 bg-gradient-to-r from-surface via-border/50 to-surface rounded-lg animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                  <p className="text-xs text-text-muted text-center">
                    AI is working out the macros...
                  </p>
                </div>
              )}

              {aiParser.isSuccess && aiParser.data && (
                <div className="py-4 space-y-2">
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                    <p className="text-sm font-medium text-primary mb-2">
                      ✅ Logged {aiParser.data.logged.length} item
                      {aiParser.data.logged.length !== 1 ? "s" : ""} ·{" "}
                      {aiParser.data.totalCalories} kcal
                    </p>
                    <div className="space-y-1">
                      {aiParser.data.logged.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-text-primary">
                            {item.name}
                            <span className="text-text-muted ml-1">
                              ({item.quantity}g)
                            </span>
                          </span>
                          <span className="text-text-secondary">
                            {item.calories} kcal
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-text-muted text-center">
                    via {aiParser.data.provider} · estimates may vary
                  </p>
                </div>
              )}

              {aiParser.isError && (
                <div className="py-4 space-y-2">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    <p className="text-sm text-red-400">
                      {aiParser.error?.message ||
                        "AI could not work that one out."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleParseWithAI}
                    className="w-full py-2 text-sm text-primary font-medium hover:underline"
                  >
                    Try again
                  </button>
                </div>
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
