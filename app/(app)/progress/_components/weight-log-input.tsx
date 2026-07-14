"use client";

/**
 * Weight Log Input — Quick input for today's weight
 * ══════════════════════════════════════════════════
 *
 * Simple number input + "Log" button. Upserts — logging twice
 * on the same day overwrites the first entry (no duplicates).
 */

import { useState } from "react";
import { useLogWeight } from "@/lib/hooks/use-progress";

export function WeightLogInput() {
  const [weight, setWeight] = useState("");
  const logWeight = useLogWeight();

  async function handleLog() {
    const w = parseFloat(weight);
    if (isNaN(w) || w < 30 || w > 300) return;

    try {
      await logWeight.mutateAsync({ weightKg: w });
      setWeight("");
    } catch {
      // Error handled by TanStack Query
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-4 lg:p-5 border border-border h-full">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Log Today&apos;s Weight
      </h3>

      <div className="flex gap-3">
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g., 78.5"
          className="flex-1 p-3 bg-background border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleLog}
          disabled={logWeight.isPending || !weight}
          className="px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {logWeight.isPending ? "..." : "Log"}
        </button>
      </div>

      {logWeight.isSuccess && (
        <p className="text-xs text-success mt-2">✅ Weight logged!</p>
      )}
    </div>
  );
}
