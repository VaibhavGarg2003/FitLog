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
import { SaveTemplateModal } from "./save-template-modal";

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
        id: string;
        name: string;
        muscleGroup: string;
      };
    }>;
  };
}

export function SessionSummary({ session }: SessionSummaryProps) {
  const [showSaveModal, setShowSaveModal] = useState(false);

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

      {/* Save as Template — completed sessions only. Opens the subset picker
          so one session can become several templates (biceps / triceps / …). */}
      {session.status === "COMPLETED" && (
        <div className="p-3 px-4 border-t border-border">
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="w-full py-2 text-sm text-text-secondary hover:text-primary font-medium transition-colors"
          >
            💾 Save as Template
          </button>
        </div>
      )}

      {showSaveModal && (
        <SaveTemplateModal
          sessionId={session.id}
          sets={session.exerciseSets}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}
