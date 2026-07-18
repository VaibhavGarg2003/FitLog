"use client";

/**
 * Save Template Modal — split one session into templates, your way
 * ═════════════════════════════════════════════════════════════════
 *
 * Opened from a session (active or completed). Lets the user:
 *   • pick WHICH logged exercises to include (checkboxes, all on by default)
 *   • save them as a NEW template (name), OR add them to an EXISTING one
 *   • then "Create another" without closing — so one session becomes a
 *     Biceps template AND a separate Triceps template.
 *
 * Every write is server-derived + owner-scoped:
 *   New     → POST /api/templates            { name, fromSessionId, exerciseIds }
 *   Existing→ POST /api/templates/[id]/append { fromSessionId, exerciseIds }
 */

import { useMemo, useState } from "react";
import {
  useSaveTemplate,
  useAppendToTemplate,
  useTemplates,
} from "@/lib/hooks/use-templates";
import { cn } from "@/lib/utils/cn";

/** Raw sets from a session (active or completed) — we derive exercises here. */
interface SessionSet {
  isWarmup: boolean;
  exercise: { id: string; name: string; muscleGroup: string };
}

interface SaveTemplateModalProps {
  sessionId: string;
  sets: SessionSet[];
  onClose: () => void;
}

export function SaveTemplateModal({
  sessionId,
  sets,
  onClose,
}: SaveTemplateModalProps) {
  const saveTemplate = useSaveTemplate();
  const appendToTemplate = useAppendToTemplate();
  const { data: templates } = useTemplates();

  // Distinct exercises in first-logged order, with working-set counts.
  const exercises = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; muscleGroup: string; sets: number }
    >();
    for (const s of sets) {
      const e = map.get(s.exercise.id);
      if (e) {
        if (!s.isWarmup) e.sets += 1;
      } else {
        map.set(s.exercise.id, {
          id: s.exercise.id,
          name: s.exercise.name,
          muscleGroup: s.exercise.muscleGroup,
          sets: s.isWarmup ? 0 : 1,
        });
      }
    }
    return [...map.values()].map((e) => ({ ...e, sets: Math.max(e.sets, 1) }));
  }, [sets]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(exercises.map((e) => e.id))
  );
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [targetTemplateId, setTargetTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const busy = saveTemplate.isPending || appendToTemplate.isPending;
  const hasTemplates = (templates?.length ?? 0) > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    setSavedMsg(null);
    const ids = [...selected];
    if (ids.length === 0) {
      setError("Pick at least one exercise.");
      return;
    }

    try {
      if (mode === "new") {
        if (!name.trim()) {
          setError("Give the template a name.");
          return;
        }
        await saveTemplate.mutateAsync({
          name: name.trim(),
          fromSessionId: sessionId,
          exerciseIds: ids,
        });
        setSavedMsg(`Saved "${name.trim()}" ✓`);
      } else {
        if (!targetTemplateId) {
          setError("Choose a template to add to.");
          return;
        }
        await appendToTemplate.mutateAsync({
          templateId: targetTemplateId,
          fromSessionId: sessionId,
          exerciseIds: ids,
        });
        const tName =
          templates?.find((t) => t.id === targetTemplateId)?.name ?? "template";
        setSavedMsg(`Added to "${tName}" ✓`);
      }
      // Reset for a possible SECOND template from a different subset.
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-surface-elevated rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-bold text-text-primary">Save as Template</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Exercise picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">
                Include exercises ({selected.size}/{exercises.length})
              </p>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selected.size === exercises.length
                      ? new Set()
                      : new Set(exercises.map((e) => e.id))
                  )
                }
                className="text-xs text-primary hover:underline"
              >
                {selected.size === exercises.length ? "Clear all" : "Select all"}
              </button>
            </div>
            {exercises.map((e) => (
              <label
                key={e.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                  selected.has(e.id)
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-surface hover:border-text-muted"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="accent-primary"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text-primary truncate">
                    {e.name}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {e.muscleGroup} · {e.sets} set{e.sets !== 1 ? "s" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {/* Destination: new vs existing */}
          <div className="space-y-3 pt-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                  mode === "new"
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-surface border border-border text-text-secondary"
                )}
              >
                New template
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                disabled={!hasTemplates}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40",
                  mode === "existing"
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-surface border border-border text-text-secondary"
                )}
              >
                Add to existing
              </button>
            </div>

            {mode === "new" ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name (e.g., Biceps Day)"
                maxLength={60}
                className="w-full p-3 bg-background border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            ) : (
              <select
                value={targetTemplateId}
                onChange={(e) => setTargetTemplateId(e.target.value)}
                className="w-full p-3 bg-background border border-border rounded-xl text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="">Choose a template…</option>
                {templates?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {savedMsg && (
            <p className="text-sm text-primary">
              {savedMsg} — adjust the selection to save another, or close.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {busy
              ? "Saving..."
              : mode === "new"
                ? "Save template"
                : "Add to template"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 rounded-xl border border-border text-text-secondary font-medium hover:bg-surface-hover transition-colors"
          >
            {savedMsg ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
