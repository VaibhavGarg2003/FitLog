"use client";

/**
 * Set Logger — Input form for logging individual exercise sets
 * ═════════════════════════════════════════════════════════════
 *
 * Appears after selecting an exercise from the browser, from the session
 * card's "+ sets", or from a template's Session Plan.
 *
 * ALREADY-LOGGED SETS ARE SHOWN AND EDITABLE HERE:
 * ────────────────────────────────────────────────
 * Reopening an exercise used to drop you into a blank "Set 1" form even when
 * that exercise already had sets — which both misled (it was really set 4)
 * and offered no way to fix set 2 without leaving for another panel. The sets
 * for THIS exercise now render above the form in the same <SetRow> editor the
 * session card uses, and the form continues the numbering.
 *
 * SET NUMBERING IS DERIVED, NOT COUNTED LOCALLY:
 * ──────────────────────────────────────────────
 * `existingSets` comes from the server on every render, so deleting set 3
 * immediately turns "Log Set 4" back into "Log Set 3". The server keeps set
 * numbers contiguous per exercise (see deleteSetForUser), so "count + 1" is
 * always the right next number.
 *
 * USE PREVIOUS SET (set 2+):
 * ──────────────────────────
 * Prefills from the last logged set (weight, reps, intensity, warm-up).
 * Sourced from server data rather than local memory, so it still works after
 * you leave the exercise and come back, or edit an earlier set.
 *
 * INTENSITY SCALE (was RPE 1-10):
 * ────────────────────────────────
 * The original RPE (Rate of Perceived Exertion) 1-10 scale is a sports
 * science term most users don't understand. We simplify it to 1-5:
 *   1 = Very Easy  (warm-up level, could do 10+ more reps)
 *   2 = Easy       (comfortable, could do 5+ more reps)
 *   3 = Moderate   (working hard, could do 2-3 more reps)
 *   4 = Hard       (very tough, could do 1 more rep at most)
 *   5 = Max Effort (couldn't do another rep)
 *
 * Internally stored in the DB as the same `rpe` field (1-5 range).
 * The engine uses it for session intensity calculations.
 */

import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { SetRow, type LoggedSet } from "./set-row";

const INTENSITY_LABELS: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Moderate",
  4: "Hard",
  5: "Max Effort",
};

interface SetLoggerProps {
  exerciseName: string;
  /** This exercise's sets in the active session, ascending — server truth. */
  existingSets: LoggedSet[];
  sessionId: string;
  date: string;
  onLogSet: (data: {
    weight: number;
    reps: number;
    rpe?: number;
    isWarmup: boolean;
    clientRequestId: string;
  }) => void | Promise<void>;
  onDone: () => void;
  isPending: boolean;
}

export function SetLogger({
  exerciseName,
  existingSets,
  sessionId,
  date,
  onLogSet,
  onDone,
  isPending,
}: SetLoggerProps) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [intensity, setIntensity] = useState<number | null>(null);
  const [isWarmup, setIsWarmup] = useState(false);
  const [showScale, setShowScale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One UUID per logging attempt. Held across failures so a request that
  // succeeded server-side but failed client-side becomes an idempotent
  // replay (no duplicate set). Cleared only after a successful log.
  const clientRequestIdRef = useRef<string | null>(null);

  // NOTE: switching exercises resets this form via a `key` remount at the call
  // site (workout/page.tsx passes key={activeExercise.id}) — React's
  // sanctioned replacement for a reset-state-on-prop-change effect.

  const setsLogged = existingSets.length;
  const previousSet = setsLogged > 0 ? existingSets[setsLogged - 1] : null;

  async function handleLog() {
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      setError("Weight must be greater than 0.");
      return;
    }
    const r = parseInt(reps, 10);
    if (isNaN(r) || r <= 0) {
      setError("Reps must be at least 1.");
      return;
    }
    setError(null);

    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = crypto.randomUUID();
    }

    try {
      await Promise.resolve(
        onLogSet({
          weight: w,
          reps: r,
          rpe: intensity ?? undefined,
          isWarmup,
          clientRequestId: clientRequestIdRef.current,
        })
      );
    } catch {
      // Keep form values AND the clientRequestId so the user can fix and retry.
      setError("Could not log the set. Try again.");
      return;
    }

    clientRequestIdRef.current = null;

    // Clear reps/intensity so the form is ready for a fresh entry or a one-tap
    // "Use previous set" fill. Weight stays as a convenience default.
    setReps("");
    setIntensity(null);
    setIsWarmup(false);
  }

  /** Prefill form from last set — does not submit; user can tweak then Log. */
  function handleUsePreviousSet() {
    if (!previousSet) return;
    setWeight(previousSet.weight != null ? String(previousSet.weight) : "");
    setReps(previousSet.reps != null ? String(previousSet.reps) : "");
    setIntensity(previousSet.rpe ?? null);
    setIsWarmup(previousSet.isWarmup);
    setError(null);
  }

  const previousSummary = previousSet
    ? `${previousSet.weight ?? "—"} kg × ${previousSet.reps ?? "—"}` +
      (previousSet.rpe != null ? ` · intensity ${previousSet.rpe}` : "") +
      (previousSet.isWarmup ? " · warmup" : "")
    : null;

  return (
    <div className="bg-surface rounded-2xl border border-border p-4 lg:p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-text-primary">{exerciseName}</h3>
          <p className="text-xs text-text-muted">Set {setsLogged + 1}</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-primary font-medium hover:underline"
        >
          Done with this exercise
        </button>
      </div>

      {/* Already logged for THIS exercise — editable in place, so coming back
          to an exercise means "review and fix", not only "add another". */}
      {setsLogged > 0 && (
        <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider pb-1">
            Already logged · {setsLogged} set{setsLogged !== 1 ? "s" : ""}
          </p>
          {existingSets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              sessionId={sessionId}
              date={date}
              exerciseName={exerciseName}
            />
          ))}
        </div>
      )}

      {/* Copy last set — only after set 1 exists for this exercise */}
      {previousSet && (
        <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
          <button
            type="button"
            onClick={handleUsePreviousSet}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 disabled:opacity-50 transition-colors"
          >
            <Copy size={16} aria-hidden />
            Use previous set
          </button>
          <p className="text-[11px] text-text-muted text-center">
            Fills weight, reps & intensity from set {previousSet.setNumber}
            {previousSummary ? ` (${previousSummary})` : ""}. Adjust weight if
            you want, then log.
          </p>
        </div>
      )}

      {/* Weight + Reps row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">Weight (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="60"
            className="w-full p-2.5 bg-background border border-border rounded-lg text-center text-text-primary focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Reps</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="10"
            className="w-full p-2.5 bg-background border border-border rounded-lg text-center text-text-primary focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Intensity 1-5 selector */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs text-text-muted">
            Intensity{" "}
            <span className="text-text-muted">
              {intensity ? `— ${INTENSITY_LABELS[intensity]}` : "(optional)"}
            </span>
          </label>
          <button
            type="button"
            onClick={() => setShowScale((v) => !v)}
            className="text-[10px] text-primary hover:underline"
          >
            {showScale ? "hide" : "what's this?"}
          </button>
        </div>

        {/* Scale hint */}
        {showScale && (
          <div className="mb-2 p-2.5 bg-background rounded-lg border border-border space-y-0.5">
            {Object.entries(INTENSITY_LABELS).map(([num, label]) => (
              <p key={num} className="text-[11px] text-text-muted">
                <span className="font-semibold text-text-secondary">{num}</span> — {label}
              </p>
            ))}
          </div>
        )}

        {/* 1-5 pill buttons */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIntensity(intensity === n ? null : n)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                intensity === n
                  ? "bg-primary text-white shadow-sm"
                  : "bg-background border border-border text-text-secondary hover:border-primary"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Warmup checkbox */}
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={isWarmup}
          onChange={(e) => setIsWarmup(e.target.checked)}
          className="accent-primary w-4 h-4"
        />
        Warmup set (not counted for volume)
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Log Button */}
      <button
        type="button"
        onClick={handleLog}
        disabled={isPending || !weight || !reps}
        className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
      >
        {isPending ? "Logging..." : `Log Set ${setsLogged + 1}`}
      </button>
    </div>
  );
}
