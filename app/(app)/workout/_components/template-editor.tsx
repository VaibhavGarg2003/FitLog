"use client";

/**
 * Template Editor — modal for reshaping a saved template
 * ═══════════════════════════════════════════════════════
 *
 * Opened from TemplateList's "Edit" button. Lets the user:
 *   • rename the template
 *   • change target sets per exercise (− / + stepper, 1–10)
 *   • remove an exercise (✕)
 *   • add exercises (reuses the ExerciseBrowser modal)
 *
 * Edits are local state until "Save changes" → PUT /api/templates/[id]
 * (owner-scoped) → templates query invalidated → list refreshes.
 */

import { useState } from "react";
import {
  useUpdateTemplate,
  type WorkoutTemplate,
  type TemplateExercise,
} from "@/lib/hooks/use-templates";
import { ExerciseBrowser } from "./exercise-browser";

interface TemplateEditorProps {
  template: WorkoutTemplate;
  onClose: () => void;
}

export function TemplateEditor({ template, onClose }: TemplateEditorProps) {
  const updateTemplate = useUpdateTemplate();

  const [name, setName] = useState(template.name);
  const [exercises, setExercises] = useState<TemplateExercise[]>(
    template.exercises
  );
  const [showBrowser, setShowBrowser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeSets(exerciseId: string, delta: number) {
    setExercises((prev) =>
      prev.map((e) =>
        e.exerciseId === exerciseId
          ? { ...e, targetSets: Math.min(10, Math.max(1, e.targetSets + delta)) }
          : e
      )
    );
  }

  function removeExercise(exerciseId: string) {
    setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }
    if (exercises.length === 0) {
      setError("A template needs at least one exercise.");
      return;
    }
    setError(null);
    try {
      await updateTemplate.mutateAsync({
        templateId: template.id,
        name: name.trim(),
        exercises,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-surface-elevated rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col border border-border">
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-bold text-text-primary">Edit Template</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Template name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full p-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          {/* Exercises */}
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Exercises</p>
            {exercises.map((e) => (
              <div
                key={e.exerciseId}
                className="bg-surface rounded-xl border border-border p-3 flex items-center gap-3"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text-primary truncate">
                    {e.name}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {e.muscleGroup}
                  </span>
                </span>

                {/* Target sets stepper */}
                <span className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => changeSets(e.exerciseId, -1)}
                    aria-label="Fewer sets"
                    className="w-7 h-7 rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary text-sm"
                  >
                    −
                  </button>
                  <span className="text-sm text-text-primary w-12 text-center">
                    {e.targetSets} set{e.targetSets !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeSets(e.exerciseId, 1)}
                    aria-label="More sets"
                    className="w-7 h-7 rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary text-sm"
                  >
                    +
                  </button>
                </span>

                <button
                  type="button"
                  onClick={() => removeExercise(e.exerciseId)}
                  aria-label={`Remove ${e.name}`}
                  className="shrink-0 text-text-muted hover:text-red-400 text-lg leading-none px-1"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setShowBrowser(true)}
              className="w-full py-3 bg-surface border-2 border-dashed border-border rounded-xl text-text-secondary text-sm font-medium hover:border-primary hover:text-primary transition-colors"
            >
              + Add Exercise
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={updateTemplate.isPending}
            className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {updateTemplate.isPending ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 rounded-xl border border-border text-text-secondary font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Add-exercise picker — dedupes against what's already in the plan */}
      <ExerciseBrowser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={(exercise) => {
          setExercises((prev) =>
            prev.some((e) => e.exerciseId === exercise.id)
              ? prev
              : [
                  ...prev,
                  {
                    exerciseId: exercise.id,
                    name: exercise.name,
                    muscleGroup: exercise.muscleGroup,
                    category: exercise.category,
                    metValue: exercise.metValue,
                    isCompound: exercise.isCompound,
                    targetSets: 3,
                  },
                ]
          );
        }}
      />
    </div>
  );
}
