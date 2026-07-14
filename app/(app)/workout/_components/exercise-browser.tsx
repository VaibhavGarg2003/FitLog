"use client";

/**
 * Exercise Browser — Search and select exercises
 * ═══════════════════════════════════════════════
 *
 * Uses the useExercises hook (Step 2) to browse the 155 seeded exercises.
 * Supports filtering by muscle group and searching by name.
 */

import { useState } from "react";
import { useExercises } from "@/lib/hooks/use-exercises";
import { cn } from "@/lib/utils/cn";

const MUSCLE_GROUPS = [
  "All",
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Core",
  "Cardio",
  "Full Body",
];

interface ExerciseBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    category: string;
    metValue: number;
    isCompound: boolean;
  }) => void;
}

export function ExerciseBrowser({
  isOpen,
  onClose,
  onSelect,
}: ExerciseBrowserProps) {
  const [selectedMuscle, setSelectedMuscle] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: exercises, isLoading } = useExercises({
    muscleGroup: selectedMuscle === "All" ? undefined : selectedMuscle,
    query: searchQuery || undefined,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-surface-elevated rounded-t-2xl sm:rounded-2xl w-full max-w-lg lg:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-border">
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-bold text-text-primary">Add Exercise</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>

        {/* Muscle Group Chips */}
        <div className="flex gap-2 overflow-x-auto p-3 border-b border-border">
          {MUSCLE_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setSelectedMuscle(group)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                selectedMuscle === group
                  ? "bg-primary text-white"
                  : "bg-surface-hover text-text-secondary hover:text-text-primary"
              )}
            >
              {group}
            </button>
          ))}
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <p className="text-sm text-text-muted text-center py-4">
              Loading exercises...
            </p>
          )}

          {exercises?.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => {
                onSelect(exercise);
                onClose();
              }}
              className="w-full p-3 rounded-xl text-left hover:bg-surface-hover transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-text-primary">
                    {exercise.name}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-muted">
                      {exercise.muscleGroup}
                    </span>
                    {exercise.isCompound && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        Compound
                      </span>
                    )}
                    {exercise.equipment && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-muted">
                        {exercise.equipment}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
