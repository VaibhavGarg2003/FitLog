"use client";

/**
 * Session Summary — Shows completed workout session details
 * ═════════════════════════════════════════════════════════
 *
 * Displays after a workout session is finished.
 * Shows exercises, sets, and the calorie burn estimate (as INFO ONLY).
 * Completed sessions can be saved as a reusable TEMPLATE — the server
 * derives the exercise plan from this session's real sets.
 */

import { useState } from "react";
import { useSaveTemplate } from "@/lib/hooks/use-templates";

interface SessionSummaryProps {
  session: {
    id: string;
    durationMin?: number;
    caloriesBurnedLow?: number;
    caloriesBurnedHigh?: number;
    status: string;
    exerciseSets: Array<{
      id: string;
      setNumber: number;
      weight?: number;
      reps?: number;
      rpe?: number;
      isWarmup: boolean;
      exercise: {
        name: string;
        muscleGroup: string;
      };
    }>;
  };
}

export function SessionSummary({ session }: SessionSummaryProps) {
  const saveTemplate = useSaveTemplate();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate.mutateAsync({
        name,
        fromSessionId: session.id,
      });
      setSaved(true);
      setShowSaveForm(false);
    } catch {
      // Error surfaced via saveTemplate.isError below
    }
  }

  // Group sets by exercise name
  const exerciseGroups: Record<
    string,
    {
      name: string;
      muscleGroup: string;
      sets: Array<{
        setNumber: number;
        weight?: number;
        reps?: number;
        rpe?: number;
        isWarmup: boolean;
      }>;
    }
  > = {};

  for (const set of session.exerciseSets) {
    const key = set.exercise.name;
    if (!exerciseGroups[key]) {
      exerciseGroups[key] = {
        name: set.exercise.name,
        muscleGroup: set.exercise.muscleGroup,
        sets: [],
      };
    }
    exerciseGroups[key].sets.push({
      setNumber: set.setNumber,
      weight: set.weight ?? undefined,
      reps: set.reps ?? undefined,
      rpe: set.rpe ?? undefined,
      isWarmup: set.isWarmup,
    });
  }

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-text-primary">
            {session.status === "COMPLETED" ? "✅ Workout Complete" : "🏋️ In Progress"}
          </h3>
          {session.durationMin && (
            <p className="text-xs text-text-muted">{session.durationMin} minutes</p>
          )}
        </div>
        {session.caloriesBurnedLow != null && session.caloriesBurnedHigh != null && (
          <div className="text-right">
            <p className="text-sm font-bold text-text-primary">
              ~{session.caloriesBurnedLow}–{session.caloriesBurnedHigh} kcal
            </p>
            <p className="text-[10px] text-text-muted">Info only</p>
          </div>
        )}
      </div>

      {/* Exercise Groups */}
      <div className="divide-y divide-border">
        {Object.values(exerciseGroups).map((group) => (
          <div key={group.name} className="p-3 px-4">
            <div className="flex justify-between items-baseline mb-2">
              <p className="font-medium text-text-primary text-sm">
                {group.name}
              </p>
              <span className="text-[10px] text-text-muted">
                {group.muscleGroup}
              </span>
            </div>
            <div className="space-y-1">
              {group.sets.map((set) => (
                <div
                  key={set.setNumber}
                  className="flex gap-4 text-xs text-text-secondary"
                >
                  <span className="text-text-muted w-8">
                    {set.isWarmup ? "W" : `S${set.setNumber}`}
                  </span>
                  {set.weight != null && <span>{set.weight} kg</span>}
                  {set.reps != null && <span>× {set.reps}</span>}
                  {set.rpe != null && (
                    <span className="text-text-muted">RPE {set.rpe}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Save as Template — completed sessions only */}
      {session.status === "COMPLETED" && (
        <div className="p-3 px-4 border-t border-border">
          {saved ? (
            <p className="text-xs text-primary text-center">
              ✓ Saved as template — find it under &quot;Start from
              template&quot;
            </p>
          ) : showSaveForm ? (
            <div className="space-y-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name (e.g., Push Day A)"
                maxLength={60}
                autoFocus
                className="w-full p-2.5 bg-background border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim() || saveTemplate.isPending}
                  className="flex-1 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {saveTemplate.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveForm(false)}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
              {saveTemplate.isError && (
                <p className="text-xs text-red-400">
                  {saveTemplate.error instanceof Error
                    ? saveTemplate.error.message
                    : "Failed to save template"}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="w-full py-2 text-sm text-text-secondary hover:text-primary font-medium transition-colors"
            >
              💾 Save as Template
            </button>
          )}
        </div>
      )}
    </div>
  );
}
