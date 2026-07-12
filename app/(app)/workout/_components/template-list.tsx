"use client";

/**
 * Template List — "Start from template"
 * ═══════════════════════════════════════
 *
 * Shown on the workout page when no session is active. Lists the user's
 * saved templates; starting one creates a fresh RECALL session and hands
 * the planned exercises back to the page as a checklist.
 */

import { useState } from "react";
import {
  useTemplates,
  useDeleteTemplate,
  type WorkoutTemplate,
  type TemplateExercise,
} from "@/lib/hooks/use-templates";

interface TemplateListProps {
  onStart: (template: WorkoutTemplate) => void;
  /** True while any start-from-template mutation is in flight */
  starting: boolean;
}

function summarize(exercises: TemplateExercise[]): string {
  const groups = [...new Set(exercises.map((e) => e.muscleGroup))];
  const shown = groups.slice(0, 3).join(" · ");
  return groups.length > 3 ? `${shown} +${groups.length - 3}` : shown;
}

export function TemplateList({ onStart, starting }: TemplateListProps) {
  const { data: templates, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  if (isLoading || !templates || templates.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Start from Template
      </h2>
      {templates.map((template) => (
        <div
          key={template.id}
          className="bg-surface rounded-2xl border border-border p-4 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text-primary text-sm truncate">
              {template.name}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {template.exercises.length} exercise
              {template.exercises.length !== 1 ? "s" : ""} ·{" "}
              {summarize(template.exercises)}
            </p>
          </div>

          {confirmingDelete === template.id ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  deleteTemplate.mutate(template.id);
                  setConfirmingDelete(null);
                }}
                className="text-xs text-red-400 font-semibold hover:text-red-300"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(null)}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Keep
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onStart(template)}
                disabled={starting}
                className="px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-xl hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(template.id)}
                aria-label={`Delete template ${template.name}`}
                className="text-text-muted hover:text-red-400 text-lg leading-none px-1 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
