"use client";

/**
 * Goal Card (Settings)
 * ════════════════════
 *
 * Shows the user's active weight goal (target weight + date) and lets them
 * set / change / remove it. Reads `activeGoal` from the profile query (added
 * to GET /api/profile), writes via POST/DELETE /api/goals, then invalidates
 * the profile cache so the Dashboard goal card updates too.
 *
 * "No goal" is a first-class state — a user who skipped a target in onboarding
 * lands here to set one whenever they like.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/lib/hooks/use-profile";
import { cn } from "@/lib/utils/cn";

export function GoalCard() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  const goal = profile?.activeGoal ?? null;
  const currentWeight = profile?.weightKg ?? null;

  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");
  const [months, setMonths] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setTarget(goal?.targetValue?.toString() ?? "");
    setMonths("4");
    setError("");
    setEditing(true);
  }

  async function save() {
    const targetNum = parseFloat(target);
    if (!targetNum || targetNum < 30 || targetNum > 300) {
      setError("Enter a target weight between 30 and 300 kg.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Infer goal direction from current vs target weight.
      const type =
        currentWeight == null || targetNum === currentWeight
          ? "MAINTAIN"
          : targetNum < currentWeight
            ? "LOSE_FAT"
            : "GAIN_MUSCLE";
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          startValue: currentWeight ?? targetNum,
          targetValue: targetNum,
          timelineMonths: parseInt(months) || 4,
        }),
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
    } catch {
      setError("Could not save the goal. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/goals", { method: "DELETE" });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
    } catch {
      setError("Could not remove the goal. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Weight Goal
      </h2>

      {!editing && goal && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-text-muted">Target weight</span>
            <span className="text-lg font-bold text-text-primary">
              {goal.targetValue} kg
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-text-muted">Started at</span>
            <span className="text-sm text-text-secondary">
              {goal.startValue} kg
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-text-muted">Target date</span>
            <span className="text-sm text-text-secondary">
              {new Date(goal.targetDate).toLocaleDateString()}
            </span>
          </div>
          <button
            type="button"
            onClick={startEdit}
            className="w-full mt-2 py-2 px-4 rounded-xl text-sm font-medium border border-border text-text-secondary hover:border-primary hover:text-primary transition-colors"
          >
            Change goal
          </button>
        </div>
      )}

      {!editing && !goal && (
        <div className="space-y-2">
          <p className="text-sm text-text-muted">
            No weight goal set. Add a target to track progress on your dashboard.
          </p>
          <button
            type="button"
            onClick={startEdit}
            className="w-full py-2 px-4 rounded-xl text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Set a goal
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Target weight (kg){" "}
              {currentWeight != null && `· now ${currentWeight} kg`}
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 72"
              className="w-full p-3 bg-background border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Timeline (months)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              min={1}
              max={24}
              className="w-full p-3 bg-background border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors",
                busy && "opacity-50 cursor-not-allowed"
              )}
            >
              {busy ? "Saving..." : "Save goal"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="py-2.5 px-4 rounded-xl text-sm font-medium border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
          </div>
          {goal && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="w-full py-2 px-4 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Remove goal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
