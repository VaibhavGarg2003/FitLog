"use client";

/**
 * Workout Page — Log gym sessions
 * ════════════════════════════════
 *
 * FLOW:
 * 1. Start Session (RECALL mode — logging after gym)
 * 2. Add exercises via the Exercise Browser (Step 2 seed data)
 * 3. Log sets with weight/reps/RPE via Set Logger
 * 4. Finish Session → engine calculates calorie burn (info only)
 * 5. See Session Summary
 *
 * LAYOUT (laptop):
 * - Idle: start/templates left, today's sessions right
 * - Active: logger / finish form left, checklist + controls right
 * - Completion card: centered readable width inside the wide shell
 *
 * ENGINE CONNECTION:
 * calculateStrengthBurn() from Step 2 → called in finishSession()
 * calculateCardioBurn() from Step 2 → called for cardio exercises
 * Burns are NEVER added to the daily calorie budget.
 */

import { useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import {
  useWorkoutsForDate,
  useStartSession,
  useLogSet,
  useFinishSession,
} from "@/lib/hooks/use-workout";
import {
  useStartFromTemplate,
  type TemplateExercise,
  type WorkoutTemplate,
} from "@/lib/hooks/use-templates";
import { DateStrip } from "../dashboard/_components/date-strip";
import { ExerciseBrowser } from "./_components/exercise-browser";
import { SetLogger } from "./_components/set-logger";
import { SessionSummary } from "./_components/session-summary";
import { TemplateList } from "./_components/template-list";
import {
  LoggedExercises,
  type ActiveSet,
} from "./_components/logged-exercises";
import { SaveTemplateModal } from "./_components/save-template-modal";

export default function WorkoutPage() {
  const selectedDate = useUIStore((s) => s.selectedDate);
  const { data: sessions, isLoading } = useWorkoutsForDate(selectedDate);
  const startSession = useStartSession(selectedDate);
  const startFromTemplate = useStartFromTemplate(selectedDate);
  const logSet = useLogSet(selectedDate);
  const finishSession = useFinishSession(selectedDate);

  const [showBrowser, setShowBrowser] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // The date the active session belongs to. The whole session flow (start →
  // add exercises → finish, plus the completion card) must only show on THIS
  // date. Switching the DateStrip to another day should show that day's own
  // state — not make it look like a workout is already in progress there.
  const [activeSessionDate, setActiveSessionDate] = useState<string | null>(
    null
  );
  const [activeExercise, setActiveExercise] = useState<{
    id: string;
    name: string;
    muscleGroup: string;
    category: string;
    metValue: number;
    isCompound: boolean;
  } | null>(null);

  // setsLogged = sets for the CURRENT exercise (resets when changing exercise)
  const [setsLogged, setSetsLogged] = useState(0);
  // NOTE: totalSetsInSession is DERIVED from server data below (activeSets),
  // not tracked as state — so editing/deleting sets keeps the count truthful.

  const [showFinish, setShowFinish] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [duration, setDuration] = useState("45");
  // Two-step confirm for cancelling a workout that already has logged sets,
  // so a mis-tap can't throw away a session in progress.
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // After a successful finish, show a completion screen instead of blank page
  const [workoutCompleted, setWorkoutCompleted] = useState<{
    sessionId: string;
    exerciseCount: number;
    totalSets: number;
    durationMin: number;
  } | null>(null);

  // Which session's "Save as template" picker is open (active or just-finished).
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);

  // Planned exercises when the session was started from a template.
  // Tapping one jumps straight into the SetLogger for it.
  const [plannedExercises, setPlannedExercises] = useState<
    TemplateExercise[] | null
  >(null);
  const [doneExerciseIds, setDoneExerciseIds] = useState<Set<string>>(
    new Set()
  );

  async function handleStartSession() {
    try {
      const session = await startSession.mutateAsync({
        mode: "RECALL",
      });
      setActiveSessionId(session.id);
      setActiveSessionDate(selectedDate);
      setWorkoutCompleted(null);
      setPlannedExercises(null);
      setDoneExerciseIds(new Set());
    } catch {
      // Error handled by TanStack Query
    }
  }

  async function handleStartFromTemplate(template: WorkoutTemplate) {
    try {
      const result = await startFromTemplate.mutateAsync(template.id);
      setActiveSessionId(result.session.id);
      setActiveSessionDate(selectedDate);
      setWorkoutCompleted(null);
      setPlannedExercises(result.exercises);
      setDoneExerciseIds(new Set());
    } catch {
      // Error handled by TanStack Query
    }
  }

  async function handleLogSet(data: {
    weight: number;
    reps: number;
    rpe?: number;
    isWarmup: boolean;
  }) {
    if (!activeSessionId || !activeExercise) {
      throw new Error("No active session");
    }
    // Rethrow on failure so SetLogger keeps the form (and does not treat this
    // as a successful "previous set" for the copy button).
    await logSet.mutateAsync({
      sessionId: activeSessionId,
      exerciseId: activeExercise.id,
      setNumber: setsLogged + 1,
      weight: data.weight,
      reps: data.reps,
      rpe: data.rpe,
      isWarmup: data.isWarmup,
    });
    setSetsLogged((prev) => prev + 1);
  }

  // Called when user taps "Finish Workout" button
  function handleAttemptFinish() {
    // Fix 6: Validate at least one set was logged before showing duration screen
    if (totalSetsInSession === 0) {
      setFinishError("Please log at least one exercise set before finishing.");
      return;
    }
    setFinishError(null);
    setShowFinish(true);
  }

  // Back out of a session the user doesn't want to continue. Clears the local
  // wizard state and returns to the start screen. (The empty in-progress
  // session stays in the DB but is invisible — only COMPLETED sessions are
  // listed. A dedicated cancel/delete endpoint is a possible follow-up.)
  function handleCancelSession() {
    setActiveSessionId(null);
    setActiveSessionDate(null);
    setActiveExercise(null);
    setSetsLogged(0);
    setShowFinish(false);
    setFinishError(null);
    setConfirmingCancel(false);
    setPlannedExercises(null);
    setDoneExerciseIds(new Set());
  }

  // Cancel from anywhere in the flow. If sets are already logged, ask first;
  // otherwise back out immediately (nothing to lose).
  function handleRequestCancel() {
    if (totalSetsInSession > 0) setConfirmingCancel(true);
    else handleCancelSession();
  }

  async function handleFinish() {
    if (!activeSessionId) return;
    const durationMin = parseInt(duration) || 45;

    // Count unique exercises in this session (for the completion screen)
    const currentSessions = sessions ?? [];
    const activeSessionData = currentSessions.find(
      (s: { id: string }) => s.id === activeSessionId
    );
    const exerciseCount = activeSessionData
      ? new Set(
          activeSessionData.exerciseSets?.map(
            (es: { exercise: { name: string } }) => es.exercise.name
          ) ?? []
        ).size
      : 1;

    try {
      await finishSession.mutateAsync({
        sessionId: activeSessionId,
        durationMin,
      });

      // Fix 5: Show a completion card instead of going blank
      setWorkoutCompleted({
        sessionId: activeSessionId,
        exerciseCount: Math.max(exerciseCount, 1),
        totalSets: totalSetsInSession,
        durationMin,
      });

      // Reset all session state
      setActiveSessionId(null);
      setActiveExercise(null);
      setSetsLogged(0);
      setShowFinish(false);
      setPlannedExercises(null);
      setDoneExerciseIds(new Set());
    } catch {
      // Error handled by TanStack Query
    }
  }

  const completedSessions = sessions?.filter(
    (s: { status: string }) => s.status === "COMPLETED"
  ) ?? [];

  // The in-progress session (and the just-finished completion card) belong only
  // to the date the session was started on. On any other day, show that day's
  // own state instead — otherwise a session started on the 14th makes every
  // other date look like a workout is already in progress.
  const onSessionDate = activeSessionDate === selectedDate;

  // ── Logged-so-far (active session) ────────────────────────────────
  // The server returns the active session's sets (refetched after every
  // mutation), so the card is always current. Rendering + per-set editing
  // live in <LoggedExercises>; this page just derives the inputs.
  const activeSessionData = sessions?.find(
    (s: { id: string }) => s.id === activeSessionId
  );
  const activeSets = (activeSessionData?.exerciseSets ?? []) as ActiveSet[];

  // Total sets = server truth, so editing/deleting sets keeps the finish
  // validation and the completion card honest.
  const totalSetsInSession = activeSets.length;

  // Reopen a logged exercise to add more sets — numbering continues after the
  // highest existing set number (deletes can leave gaps; length would collide).
  function handleEditExercise(
    exercise: ActiveSet["exercise"],
    nextSetNumber: number
  ) {
    setActiveExercise(exercise);
    setSetsLogged(nextSetNumber - 1);
    setShowFinish(false);
  }

  const loggedSoFar =
    activeSets.length > 0 && activeSessionId ? (
      <div className="space-y-2">
        <LoggedExercises
          sets={activeSets}
          sessionId={activeSessionId}
          date={selectedDate}
          activeExerciseId={activeExercise?.id ?? null}
          onAddSets={handleEditExercise}
        />
        {/* Save any subset of what's logged as a template — right now, mid
            workout (e.g. save biceps before starting triceps). */}
        <button
          type="button"
          onClick={() => setSavingSessionId(activeSessionId)}
          className="w-full py-2 text-sm text-text-secondary hover:text-primary font-medium transition-colors"
        >
          💾 Save as template
        </button>
      </div>
    ) : null;

  const plannedChecklist =
    plannedExercises && plannedExercises.length > 0 ? (
      <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
        {plannedExercises.map((planned) => {
          const done = doneExerciseIds.has(planned.exerciseId);
          const isCurrent = activeExercise?.id === planned.exerciseId;
          return (
            <button
              key={planned.exerciseId}
              type="button"
              onClick={() => {
                setActiveExercise({
                  id: planned.exerciseId,
                  name: planned.name,
                  muscleGroup: planned.muscleGroup,
                  category: planned.category,
                  metValue: planned.metValue,
                  isCompound: planned.isCompound,
                });
                setSetsLogged(0);
                setShowFinish(false);
              }}
              className={`w-full p-3 px-4 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors ${
                isCurrent ? "bg-primary/5" : ""
              }`}
            >
              <span className="text-lg leading-none">
                {done ? "✅" : "⬜"}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className={`block text-sm font-medium truncate ${
                    done
                      ? "text-text-muted line-through"
                      : "text-text-primary"
                  }`}
                >
                  {planned.name}
                </span>
                <span className="block text-xs text-text-muted">
                  {planned.muscleGroup} · {planned.targetSets} set
                  {planned.targetSets !== 1 ? "s" : ""} planned
                </span>
              </span>
            </button>
          );
        })}
      </div>
    ) : null;

  const sessionControls = (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {totalSetsInSession} set{totalSetsInSession !== 1 ? "s" : ""} logged
      </p>

      {/* On phone, checklist lives here with controls; on laptop it also
          appears in the right column while logging so users can switch. */}
      {!activeExercise && !showFinish && plannedChecklist}

      <button
        type="button"
        onClick={() => setShowBrowser(true)}
        className="w-full py-4 bg-surface border-2 border-dashed border-border rounded-2xl text-text-secondary font-medium hover:border-primary hover:text-primary transition-colors"
      >
        + Add Exercise
      </button>
      <button
        type="button"
        onClick={handleAttemptFinish}
        className="w-full py-3 bg-primary/10 text-primary font-semibold rounded-xl hover:bg-primary/20 transition-colors"
      >
        Finish Workout
      </button>
      {finishError && (
        <p className="text-sm text-red-400 text-center">{finishError}</p>
      )}
    </div>
  );

  const sessionsList =
    completedSessions.length > 0 ? (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Today&apos;s Sessions
        </h2>
        {completedSessions.map((session: {
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
            exercise: { id: string; name: string; muscleGroup: string };
          }>;
        }) => (
          <SessionSummary key={session.id} session={session} />
        ))}
      </div>
    ) : null;

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-[family-name:var(--font-outfit)]">
          Workout
        </h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Log your gym session
        </p>
      </div>

      <DateStrip />

      {/* Active Session — split logger | checklist on laptop */}
      {activeSessionId && onSessionDate ? (
        <div className="space-y-4 lg:space-y-5">
          {/* Cancel the whole workout — available at EVERY stage (logging,
              finishing, between exercises). Confirms first if sets exist so a
              mis-tap can't discard progress. */}
          {confirmingCancel ? (
            <div className="flex flex-wrap items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <span className="text-sm text-text-primary">
                Discard this workout and start over?
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={handleCancelSession}
                  className="text-sm font-semibold text-red-400 hover:text-red-300"
                >
                  Discard workout
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  className="text-sm text-text-muted hover:text-text-primary"
                >
                  Keep going
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRequestCancel}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              ← Cancel workout
            </button>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 lg:items-start">
          <div className="space-y-4 lg:col-span-7">
            {activeExercise ? (
              <SetLogger
                // key: switching exercises remounts the logger, resetting its
                // form + previous-set memory (replaces a setState-in-effect).
                key={activeExercise.id}
                exerciseId={activeExercise.id}
                exerciseName={activeExercise.name}
                setsLogged={setsLogged}
                isPending={logSet.isPending}
                onLogSet={handleLogSet}
                onDone={() => {
                  // If this exercise was part of the template plan and got at
                  // least one set, tick it off the checklist.
                  if (setsLogged > 0) {
                    const finishedId = activeExercise.id;
                    setDoneExerciseIds((prev) => new Set(prev).add(finishedId));
                  }
                  setActiveExercise(null);
                  setSetsLogged(0);
                }}
              />
            ) : showFinish ? (
              /* Duration screen — has a Back button */
              <div className="bg-surface rounded-2xl border border-border p-4 lg:p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowFinish(false)}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    ← Back
                  </button>
                  <h3 className="font-semibold text-text-primary">
                    Finish Workout
                  </h3>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    How long was your workout? (minutes)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full p-3 bg-background border border-border rounded-xl text-text-primary focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={finishSession.isPending}
                  className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50"
                >
                  {finishSession.isPending ? "Finishing..." : "Complete Workout ✅"}
                </button>
              </div>
            ) : (
              // Phone: full session UI. Laptop: primary column still shows
              // controls; checklist also mirrors on the right when present.
              <div className="lg:hidden">{sessionControls}</div>
            )}

            {/* Phone: exercises logged so far — visible while logging the next
                one, between exercises, and on the finish screen. */}
            {loggedSoFar && <div className="lg:hidden">{loggedSoFar}</div>}

            {/* Laptop primary column when no exercise selected and not finishing:
                compact status + primary actions (checklist is on the right). */}
            {!activeExercise && !showFinish && (
              <div className="hidden lg:block space-y-3">
                <p className="text-xs text-text-muted">
                  {totalSetsInSession} set
                  {totalSetsInSession !== 1 ? "s" : ""} logged this session
                </p>
                <button
                  type="button"
                  onClick={() => setShowBrowser(true)}
                  className="w-full py-4 bg-surface border-2 border-dashed border-border rounded-2xl text-text-secondary font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Exercise
                </button>
                <button
                  type="button"
                  onClick={handleAttemptFinish}
                  className="w-full py-3 bg-primary/10 text-primary font-semibold rounded-xl hover:bg-primary/20 transition-colors"
                >
                  Finish Workout
                </button>
                {finishError && (
                  <p className="text-sm text-red-400 text-center">{finishError}</p>
                )}
              </div>
            )}
          </div>

          {/* Secondary column — checklist + actions while logging on laptop */}
          <div className="hidden lg:block lg:col-span-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              {plannedExercises?.length ? "Session Plan" : "Session"}
            </h2>
            {plannedChecklist}
            {/* Laptop: logged exercises live in the Session panel */}
            {loggedSoFar}
            {!plannedChecklist && !loggedSoFar && (
              <div className="bg-surface rounded-2xl border border-border p-5 text-sm text-text-muted">
                Add exercises as you go, or finish when you&apos;re done.
              </div>
            )}
            {(activeExercise || showFinish) && (
              <div className="space-y-2">
                <p className="text-xs text-text-muted">
                  {totalSetsInSession} set
                  {totalSetsInSession !== 1 ? "s" : ""} logged
                </p>
                <button
                  type="button"
                  onClick={() => setShowBrowser(true)}
                  className="w-full py-3 bg-surface border border-border rounded-xl text-text-secondary font-medium hover:border-primary hover:text-primary transition-colors text-sm"
                >
                  + Add Exercise
                </button>
                {!showFinish && (
                  <button
                    type="button"
                    onClick={handleAttemptFinish}
                    className="w-full py-3 bg-primary/10 text-primary font-semibold rounded-xl hover:bg-primary/20 transition-colors text-sm"
                  >
                    Finish Workout
                  </button>
                )}
                {finishError && (
                  <p className="text-sm text-red-400 text-center">{finishError}</p>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      ) : workoutCompleted && onSessionDate ? (
        /* Completion card — readable width, centered in the shell */
        <div className="max-w-lg mx-auto">
          <div
            className="bg-surface rounded-2xl border border-primary/30 p-6 lg:p-8 space-y-4 text-center"
            style={{ boxShadow: "0 4px 24px rgba(34, 197, 94, 0.15)" }}
          >
            <div className="text-5xl">🎉</div>
            <div>
              <h3 className="text-xl font-bold text-text-primary">Workout Complete!</h3>
              <p className="text-text-muted text-sm mt-1">Great job — session saved.</p>
            </div>
            <div className="flex justify-around py-2">
              <div>
                <p className="text-2xl font-bold text-primary">{workoutCompleted.totalSets}</p>
                <p className="text-xs text-text-muted">Total Sets</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{workoutCompleted.durationMin}</p>
                <p className="text-xs text-text-muted">Minutes</p>
              </div>
            </div>
            {/* Save the just-finished session as template(s) — pick which
                exercises, split into as many templates as you like. */}
            <button
              type="button"
              onClick={() => setSavingSessionId(workoutCompleted.sessionId)}
              className="w-full py-3 bg-primary/10 text-primary font-semibold rounded-xl hover:bg-primary/20 transition-colors"
            >
              💾 Save as Template
            </button>
            <button
              type="button"
              onClick={() => setWorkoutCompleted(null)}
              className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        /* Idle: start options left, today's sessions right on laptop */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 lg:items-start">
          <div className="space-y-4 lg:col-span-5">
            <button
              type="button"
              onClick={handleStartSession}
              disabled={startSession.isPending || startFromTemplate.isPending}
              className="w-full py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-hover disabled:opacity-50 transition-colors text-lg shadow-md"
              style={{ boxShadow: "0 4px 20px rgba(34, 197, 94, 0.3)" }}
            >
              {startSession.isPending ? "Starting..." : "🏋️ Start Workout"}
            </button>

            <TemplateList
              onStart={handleStartFromTemplate}
              starting={startFromTemplate.isPending}
            />
          </div>

          <div className="space-y-3 lg:col-span-7">
            {isLoading && (
              <div className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-32" />
            )}
            {sessionsList}
            {!isLoading && completedSessions.length === 0 && (
              <div className="bg-surface rounded-2xl border border-border p-6 lg:p-8 text-center">
                <p className="text-sm text-text-muted">
                  No sessions logged for this day yet.
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Start a workout or pick a template to begin.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completed sessions while mid-session still useful below on phone */}
      {activeSessionId && sessionsList && (
        <div className="lg:mt-2">{sessionsList}</div>
      )}

      {/* Exercise Browser Modal */}
      <ExerciseBrowser
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={(exercise) => {
          setActiveExercise(exercise);
          setSetsLogged(0);
        }}
      />

      {/* Save-as-template picker — driven by savingSessionId, sourced from the
          live session data so it works both mid-workout and just after. */}
      {savingSessionId &&
        (() => {
          const saving = sessions?.find(
            (s: { id: string }) => s.id === savingSessionId
          );
          const savingSets = (saving?.exerciseSets ?? []) as ActiveSet[];
          if (savingSets.length === 0) return null;
          return (
            <SaveTemplateModal
              sessionId={savingSessionId}
              sets={savingSets}
              onClose={() => setSavingSessionId(null)}
            />
          );
        })()}
    </div>
  );
}
