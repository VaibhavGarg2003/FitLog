"use client";

/**
 * Custom Food Form — "these are MY macros"
 * ════════════════════════════════════════
 *
 * Protein powder is the case that forced this: concentrate vs isolate vs blend
 * moves protein from ~75g to ~90g per 100g, so the generic average is wrong
 * every day for anyone who cares. Rather than ship a brand list — third-party
 * label data that also goes stale on reformulation — the user saves their own
 * numbers once, straight off the tub.
 *
 * Saving is keyed on the NAME, so re-saving after a brand switch overwrites the
 * same row: search keeps showing exactly one "My Whey Protein", now with the
 * new macros. Nothing already logged is touched.
 *
 * Prefilled from whichever food the user was looking at, so editing an average
 * is a few keystrokes rather than a blank form.
 */

import { useState } from "react";
import {
  useSaveCustomFood,
  useDeleteCustomFood,
  type CustomFood,
} from "@/lib/hooks/use-custom-foods";

interface CustomFoodFormProps {
  /** Starting values — the food being adjusted, or an existing custom food. */
  initial: {
    id?: string;
    name: string;
    category?: string | null;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    defaultUnit: string;
    defaultGrams: number;
  };
  /** True when editing a food the user already saved (enables Delete). */
  isExisting?: boolean;
  onSaved: (food: CustomFood) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

const NUM_FIELDS = [
  { key: "caloriesPer100g", label: "Calories", unit: "kcal" },
  { key: "proteinPer100g", label: "Protein", unit: "g" },
  { key: "carbsPer100g", label: "Carbs", unit: "g" },
  { key: "fatPer100g", label: "Fat", unit: "g" },
] as const;

export function CustomFoodForm({
  initial,
  isExisting = false,
  onSaved,
  onCancel,
  onDeleted,
}: CustomFoodFormProps) {
  const save = useSaveCustomFood();
  const remove = useDeleteCustomFood();

  const [name, setName] = useState(
    // A brand-new entry derived from a seeded food gets "My " so it reads as
    // distinct from the generic one it sits next to in search.
    isExisting ? initial.name : `My ${initial.name}`
  );
  const [values, setValues] = useState({
    caloriesPer100g: String(initial.caloriesPer100g),
    proteinPer100g: String(initial.proteinPer100g),
    carbsPer100g: String(initial.carbsPer100g),
    fatPer100g: String(initial.fatPer100g),
  });
  const [servingGrams, setServingGrams] = useState(String(initial.defaultGrams));
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a name so you can find it in search.");
      return;
    }

    const nums: Record<string, number> = {};
    for (const f of NUM_FIELDS) {
      const n = parseFloat(values[f.key]);
      if (isNaN(n) || n < 0) {
        setError(`${f.label} must be 0 or more.`);
        return;
      }
      nums[f.key] = n;
    }

    const grams = parseFloat(servingGrams);
    if (isNaN(grams) || grams <= 0) {
      setError("Serving size must be greater than 0.");
      return;
    }

    setError(null);

    try {
      const saved = await save.mutateAsync({
        name: trimmed,
        category: initial.category ?? null,
        caloriesPer100g: nums.caloriesPer100g,
        proteinPer100g: nums.proteinPer100g,
        carbsPer100g: nums.carbsPer100g,
        fatPer100g: nums.fatPer100g,
        defaultUnit: initial.defaultUnit || "g",
        defaultGrams: grams,
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    }
  }

  async function handleDelete() {
    if (!initial.id) return;
    try {
      await remove.mutateAsync(initial.id);
      onDeleted?.();
    } catch {
      setError("Could not delete. Try again.");
    }
  }

  const busy = save.isPending || remove.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-text-primary">
          {isExisting ? "Edit your macros" : "Save your own macros"}
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Copy the numbers from your tub&apos;s label — per 100g. Saved to your
          account, so every future log uses them. Change brands later and edit
          this; meals you already logged keep their original numbers.
        </p>
      </div>

      <div>
        <label
          htmlFor="cf-name"
          className="block text-sm text-text-secondary mb-1"
        >
          Name
        </label>
        <input
          id="cf-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Whey Protein"
          className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <p className="text-sm text-text-secondary mb-2">Per 100g</p>
        <div className="grid grid-cols-2 gap-3">
          {NUM_FIELDS.map((f) => (
            <div key={f.key}>
              <label
                htmlFor={`cf-${f.key}`}
                className="block text-xs text-text-muted mb-1"
              >
                {f.label} ({f.unit})
              </label>
              <input
                id={`cf-${f.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={values[f.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                className="w-full p-2.5 bg-surface border border-border rounded-lg text-center text-text-primary focus:border-primary focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="cf-serving"
          className="block text-xs text-text-muted mb-1"
        >
          One {initial.defaultUnit || "serving"} weighs (g)
        </label>
        <input
          id="cf-serving"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={servingGrams}
          onChange={(e) => setServingGrams(e.target.value)}
          className="w-full p-2.5 bg-surface border border-border rounded-lg text-text-primary focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-text-muted mt-1">
          Your scoop size — the label usually prints it.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {save.isPending ? "Saving..." : "Save macros"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>

      {isExisting && initial.id && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="w-full text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {remove.isPending ? "Deleting..." : "Delete this saved food"}
        </button>
      )}
    </div>
  );
}
