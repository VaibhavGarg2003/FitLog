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

import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import {
  useWorkoutsForDate,
  useStartSession,
  useFinishSession,
  useCancelSession,
  useDeleteSession,
  useUnfinishedSessions,
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
import { UnfinishedSessionCard } from "./_components/unfinished-session-card";
import { AIWorkoutInput } from "./_components/ai-workout-input";
import { UnsyncedSetsCard } from "./_components/unsynced-sets-card";
import { useProfile } from "@/lib/hooks/use-profile";
import { localDateStr } from "@/lib/utils/local-date";
import { useOutbox } from "@/lib/offline/outbox-provider";
import { mergeSessionSets, nextSetNumber } from "@/lib/offline/merge-sets";

export default function WorkoutPage() {
  const selectedDate = useUIStore((s) => s.selectedDate);
  const setSelectedDate = useUIStore((s) => s.setSelectedDate);
  const { data: sessions, isLoading } = useWorkoutsForDate(selectedDate);
  const startSession = useStartSession(selectedDate);
  const startFromTemplate = useStartFromTemplate(selectedDate);
  // Sets are logged into the on-device outbox, not straight to the server, so
  // logging works with no signal (see lib/offline/outbox-provider.tsx).
  const outbox = useOutbox();
  const { reconcile } = outbox;
  const [savingSet, setSavingSet] = useState(false);
  const finishSession = useFinishSession(selectedDate);
  const cancelSession = useCancelSession(selectedDate);
  const deleteSession = useDeleteSession(selectedDate);
  const { data: unfinished } = useUnfinishedSessions();
  // Only for stamping a saved AI draft with its owner — a shared browser must
  // never offer one account's draft to another.
  const { data: profile } = useProfile();

  // What the last AI import did, so the page can say so instead of silently
  // refreshing. Cleared when the user acts again.
  //
  // It carries the DATE the sets were written to, and is shown on that date
  // only. Without it the banner is page state that ignores the date strip:
  // "Added 16 sets and finished the workout" from the 16th followed the user
  // to the 15th and every other day, reading as if those days had the sets.
  // Same rule as activeSessionDate / onSessionDate for the manual flow below.
  const [aiImportSummary, setAiImportSummary] = useState<{
    date: string;
    setsAdded: number;
    finished: boolean;
    replayed: boolean;
  } | null>(null);

  // While the AI card is open, Start Workout and the templates are hidden.
  // Both start a SEPARATE, empty session; tapping one mid-review stranded the
  // draft and left two half-logged workouts. More exercises are added inside
  // the review instead, by AI or by hand.
  const [aiFlowActive, setAiFlowActive] = useState(false);

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

  // NOTE: neither the per-exercise set count nor totalSetsInSession is state.
  // Both are DERIVED from server data below (activeSets), so editing or
  // deleting a set immediately corrects the "Log Set N" label, the session
  // count, and the finish validation.

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
    clientRequestId: string;
  }) {
    if (!activeSessionId || !activeExercise) {
      throw new Error("No active session");
    }
    // Saved to the phone first; the outbox sends it when there's signal.
    // Resolves as soon as the set is durably stored, so the form resets
    // instantly even in a basement. Rethrows if the phone couldn't store it,
    // so SetLogger keeps the form (and its clientRequestId) and shows an error.
    setSavingSet(true);
    try {
      await outbox.enqueueSet({
        sessionId: activeSessionId,
        date: activeSessionDate ?? selectedDate,
        exercise: {
          id: activeExercise.id,
          name: activeExercise.name,
          muscleGroup: activeExercise.muscleGroup,
          category: activeExercise.category,
          metValue: activeExercise.metValue,
          isCompound: activeExercise.isCompound,
        },
        payload: {
          exerciseId: activeExercise.id,
          // Advisory: the server re-derives max+1 under its lock.
          setNumber: nextSetNumber(activeSets, activeExercise.id),
          weight: data.weight,
          reps: data.reps,
          rpe: data.rpe,
          isWarmup: data.isWarmup,
          clientRequestId: data.clientRequestId,
        },
      });
    } finally {
      setSavingSet(false);
    }
  }

  /**
   * Finishing computes calorie burn from the sets the SERVER has, so every set
   * logged on this phone must arrive first — and a set the server refused must
   * be resolved (saved elsewhere or discarded), never silently left out.
   */
  async function unsyncedFinishBlocker(): Promise<string | null> {
    if (!activeSessionId) return null;
    if (failedInSession) {
      return "Some sets couldn't be saved. Resolve them above before finishing.";
    }
    const waiting =
      "Waiting for your latest sets to sync. You can finish once they're saved — reconnect if you're offline.";
    if (savingSet || unsyncedInSession > 0) return waiting;
    // `outbox.records` mirrors IndexedDB a tick behind a just-saved set, so
    // ask the store itself before letting the server compute the session.
    try {
      return (await outbox.hasUnsynced(activeSessionId)) ? waiting : null;
    } catch {
      return "Couldn't check this phone for unsynced sets. Try again.";
    }
  }

  // Called when user taps "Finish Workout" button
  async function handleAttemptFinish() {
    // Fix 6: Validate at least one set was logged before showing duration screen
    if (totalSetsInSession === 0) {
      setFinishError("Please log at least one exercise set before finishing.");
      return;
    }
    const blocker = await unsyncedFinishBlocker();
    if (blocker) {
      setFinishError(blocker);
      return;
    }
    setFinishError(null);
    // MUST clear the open exercise. The left column renders
    //   activeExercise ? <SetLogger> : showFinish ? <finish form> : ...
    // so activeExercise wins, while the right column hides the Finish button
    // once showFinish is true. Tapping Finish mid-exercise therefore made the
    // button vanish with the finish form never appearing — a dead end with no
    // way to complete the workout.
    setActiveExercise(null);
    setShowFinish(true);
  }

  // Back out of a session the user doesn't want to continue. Clears the local
  // wizard state and returns to the start screen. (The empty in-progress
  // session stays in the DB but is invisible — only COMPLETED sessions are
  // listed. A dedicated cancel/delete endpoint is a possible follow-up.)
  /**
   * Discard the workout — a REAL server-side cancel, not just local state.
   *
   * This used to only clear React state, so the session stayed IN_PROGRESS in
   * the database forever. That was invisible while the page rendered COMPLETED
   * sessions only; now that unfinished sessions are surfaced, a discarded
   * workout would immediately reappear offering "Resume". It was also one of
   * the ways sessions got stuck in the first place.
   *
   * Local state is cleared regardless of the request's outcome: the user asked
   * to leave this workout, and trapping them in it because a network call
   * failed would be worse. A failed cancel simply leaves the session
   * unfinished — recoverable, and honest.
   */
  async function handleCancelSession() {
    const sessionId = activeSessionId;

    setActiveSessionId(null);
    setActiveSessionDate(null);
    setActiveExercise(null);
    setShowFinish(false);
    setFinishError(null);
    setConfirmingCancel(false);
    setPlannedExercises(null);
    setDoneExerciseIds(new Set());

    if (!sessionId) return;
    try {
      await cancelSession.mutateAsync({ sessionId });
      // Only after the server confirmed: its queued sets can never be saved
      // now. If the cancel failed, they stay queued and sync into the session,
      // which then reappears as unfinished — nothing is lost.
      await outbox.discardSession(sessionId).catch(() => {});
    } catch {
      // Surfaced by the banner below via cancelSession.isError — never
      // swallowed. The hook invalidates on settled, so a failed discard
      // refetches and the workout reappears as unfinished: the UI tells the
      // truth rather than letting the user believe it was thrown away.
    }
  }

  // Cancel from anywhere in the flow. If sets are already logged, ask first;
  // otherwise back out immediately (nothing to lose).
  function handleRequestCancel() {
    if (totalSetsInSession > 0) setConfirmingCancel(true);
    else handleCancelSession();
  }

  async function handleFinish() {
    if (!activeSessionId) return;
    // Re-checked here: a set can be logged after the finish screen opened.
    const blocker = await unsyncedFinishBlocker();
    if (blocker) {
      setFinishError(blocker);
      setShowFinish(false);
      return;
    }
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
  // Server sets (refetched after every mutation) merged with sets still
  // queued on this phone, so the card shows a set the moment it's logged.
  // Rendering + per-set editing live in <LoggedExercises>; this page just
  // derives the inputs.
  const activeSessionData = sessions?.find(
    (s: { id: string }) => s.id === activeSessionId
  );
  const serverSets = (activeSessionData?.exerciseSets ?? []) as ActiveSet[];
  const activeSets = mergeSessionSets(
    serverSets,
    outbox.records.filter((r) => r.sessionId === activeSessionId)
  );
  const unsyncedInSession = activeSets.filter((s) => s.kind === "local").length;
  const failedInSession = activeSets.some(
    (s) => s.kind === "local" && s.syncState === "failed"
  );

  // Total sets = server + queued, so the counts, the finish validation and
  // the completion card match what the user logged.
  const totalSetsInSession = activeSets.length;

  // A queued set whose clientRequestId already appears in server data was
  // saved (e.g. its response was lost) — drop it from the queue.
  const outboxRecordCount = outbox.records.length;
  useEffect(() => {
    if (!sessions || outboxRecordCount === 0) return;
    const ids = (
      sessions as Array<{ exerciseSets?: Array<{ clientRequestId?: string | null }> }>
    ).flatMap((s) =>
      (s.exerciseSets ?? [])
        .map((es) => es.clientRequestId)
        .filter((id): id is string => !!id)
    );
    reconcile(ids);
  }, [sessions, outboxRecordCount, reconcile]);

  // The active exercise's own sets, ascending — this is what drives "Set N"
  // and the editable list inside the logger.
  const activeExerciseSets = activeExercise
    ? activeSets
        .filter((s) => s.exercise.id === activeExercise.id)
        .sort((a, b) => a.setNumber - b.setNumber)
    : [];

  // Reopen a logged exercise. No set count is passed: the logger derives its
  // own numbering from the server, so it can't drift after an edit or delete.
  function handleEditExercise(exercise: ActiveSet["exercise"]) {
    setActiveExercise(exercise);
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
            workout (e.g. save biceps before starting triceps). The template
            is built from server sets, so wait until queued sets have synced
            rather than saving a template that silently misses some. */}
        <button
          type="button"
          onClick={() => setSavingSessionId(activeSessionId)}
          disabled={unsyncedInSession > 0}
          className="w-full py-2 text-sm text-text-secondary hover:text-primary font-medium transition-colors disabled:opacity-50 disabled:hover:text-text-secondary"
        >
          {unsyncedInSession > 0
            ? "💾 Save as template (after sets sync)"
            : "💾 Save as template"}
        </button>
      </div>
    ) : null;

  const plannedChecklist =
    plannedExercises && plannedExercises.length > 0 ? (
      <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
        {plannedExercises.map((planned) => {
          // Sets already logged for this planned exercise (server truth).
          const loggedCount = activeSets.filter(
            (s) => s.exercise.id === planned.exerciseId
          ).length;
          const done = doneExerciseIds.has(planned.exerciseId);
          const isCurrent = activeExercise?.id === planned.exerciseId;
          return (
            <button
              key={planned.exerciseId}
              type="button"
              // Reopening a ticked exercise resumes it — the logger shows its
              // logged sets for editing and continues the numbering, instead
              // of restarting at "Set 1" on top of what's already there.
              onClick={() => {
                setActiveExercise({
                  id: planned.exerciseId,
                  name: planned.name,
                  muscleGroup: planned.muscleGroup,
                  category: planned.category,
                  metValue: planned.metValue,
                  isCompound: planned.isCompound,
                });
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
                  {planned.muscleGroup} ·{" "}
                  {loggedCount > 0
                    ? `${loggedCount} of ${planned.targetSets} logged — tap to edit`
                    : `${planned.targetSets} set${
                        planned.targetSets !== 1 ? "s" : ""
                      } planned`}
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

  // Local-timezone "today" (never toISOString — see lib/utils/local-date.ts),
  // used only to word the resume prompt for a past day vs the current one.
  const todayStr = localDateStr();

  // ── Unfinished workouts, across ALL dates ─────────────────────────
  // NOT scoped to the selected date. The date strip only reaches back 7 days
  // (date-strip.tsx), so a session older than that cannot be navigated to —
  // and that is exactly the person the reaper preserves sessions for. Showing
  // these only on their own date hid the feature from the users who need it.
  //
  // Empty sessions are excluded: nothing logged, nothing to resume.
  const unfinishedSessions = (
    (unfinished ?? []) as Array<{
      id: string;
      date: string;
      exerciseSets: Array<{ id: string; exercise: { id: string; name: string } }>;
    }>
  ).filter((s) => !(s.id === activeSessionId && onSessionDate));

  /**
   * Re-adopt an unfinished session so the normal logging/finish flow runs.
   *
   * The session's own date must become the selected date: activeSessionData is
   * looked up in THIS date's sessions, so resuming a 21 July workout while
   * viewing today would find no sets and render an empty session.
   */
  function handleResumeSession(sessionId: string) {
    const target = unfinishedSessions.find((s) => s.id === sessionId);
    const targetDate = target ? target.date.slice(0, 10) : selectedDate;

    setSelectedDate(targetDate);
    setActiveSessionId(sessionId);
    setActiveSessionDate(targetDate);
    setWorkoutCompleted(null);
    setActiveExercise(null);
    setShowFinish(false);
    setFinishError(null);
    setConfirmingCancel(false);
    setPlannedExercises(null);
    setDoneExerciseIds(new Set());
  }

  /**
   * Sets whose workout was gone were saved into a new workout (see
   * UnsyncedSetsCard). Open it, so the user can keep logging or finish it.
   */
  function handleRecovered(sessionId: string, date: string) {
    setSelectedDate(date);
    setActiveSessionId(sessionId);
    setActiveSessionDate(date);
    setWorkoutCompleted(null);
    setActiveExercise(null);
    setShowFinish(false);
    setFinishError(null);
    setConfirmingCancel(false);
    setPlannedExercises(null);
    setDoneExerciseIds(new Set());
  }

  /**
   * Permanently delete an unfinished workout the user will never finish.
   *
   * Hard delete, not the soft-cancel used for an ACTIVE session: this is the
   * "just get rid of it" path, and the card confirms first because the logged
   * sets go with it via cascade and there is no undo.
   */
  async function handleDeleteUnfinished(sessionId: string) {
    // If it happened to be the session being logged, drop it from local state
    // first so the UI cannot keep pointing at a row that no longer exists.
    if (sessionId === activeSessionId) {
      setActiveSessionId(null);
      setActiveSessionDate(null);
      setActiveExercise(null);
      setShowFinish(false);
    }
    try {
      await deleteSession.mutateAsync({ sessionId });
      // Only after the server confirmed the delete (see handleCancelSession).
      await outbox.discardSession(sessionId).catch(() => {});
    } catch {
      // onSettled refetches either way, so a failure simply leaves the card
      // in place rather than silently pretending it was deleted.
    }
  }

  const unfinishedList =
    unfinishedSessions.length > 0 ? (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Unfinished workouts
        </h2>
        {unfinishedSessions.map((session) => (
          <UnfinishedSessionCard
            key={session.id}
            session={session}
            sessionDate={session.date.slice(0, 10)}
            isPast={session.date.slice(0, 10) < todayStr}
            onResume={handleResumeSession}
            onDelete={handleDeleteUnfinished}
            deleting={
              deleteSession.isPending &&
              deleteSession.variables?.sessionId === session.id
            }
          />
        ))}
      </div>
    ) : null;

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

      {/* Sets saved on this phone that the server refused — recover or discard */}
      <UnsyncedSetsCard onRecovered={handleRecovered} />

      {/* A failed discard must never look like a successful one. Local state
          is cleared immediately (so the user is not trapped in a workout they
          asked to leave), but if the server call failed the session is still
          unfinished — say so, and the onSettled refetch brings it back below
          as an "Unfinished" card. */}
      {cancelSession.isError && (
        <div className="flex flex-wrap items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {/* Status-neutral on purpose: a 404 here can mean the request never
              landed, OR that another tab finished or discarded the session
              first. Claiming "it's still unfinished" would be a guess, and
              wrong in the second case. The refetch below shows the truth. */}
          <span className="text-sm text-text-primary">
            Couldn&apos;t confirm the discard — the workout list has been
            refreshed, so check below for its current state.
          </span>
          <button
            type="button"
            onClick={() => cancelSession.reset()}
            className="ml-auto text-sm text-text-muted hover:text-text-primary"
          >
            Dismiss
          </button>
        </div>
      )}

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
                {unsyncedInSession > 0 &&
                  ` ${unsyncedInSession} set${
                    unsyncedInSession === 1 ? "" : "s"
                  } not yet synced will be deleted too.`}
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
                // key: switching exercises remounts the logger, resetting the
                // form (replaces a setState-in-effect).
                key={activeExercise.id}
                exerciseName={activeExercise.name}
                existingSets={activeExerciseSets}
                sessionId={activeSessionId}
                date={selectedDate}
                isPending={savingSet}
                onLogSet={handleLogSet}
                onDone={() => {
                  // If this exercise was part of the template plan and got at
                  // least one set, tick it off the checklist.
                  if (activeExerciseSets.length > 0) {
                    const finishedId = activeExercise.id;
                    setDoneExerciseIds((prev) => new Set(prev).add(finishedId));
                  }
                  setActiveExercise(null);
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
            {/* Describe the whole session in one paragraph. Nothing is written
                until the draft has been reviewed — see AIWorkoutReview. An
                import appends to this date's in-progress session when there is
                one, so it behaves like logging during that workout. */}
            <AIWorkoutInput
              // Remount per date: an open review belongs to the date it was
              // started on, and switching the date strip must not carry it over.
              key={selectedDate}
              date={selectedDate}
              userId={profile?.userId ?? null}
              onActiveChange={setAiFlowActive}
              onImported={(result, importedDate) => {
                setAiImportSummary({
                  date: importedDate,
                  setsAdded: result.setsAdded,
                  finished: result.finished,
                  replayed: result.replayed,
                });
              }}
            />

            {/* Only on the date the import wrote to — see aiImportSummary. */}
            {aiImportSummary && aiImportSummary.date === selectedDate && (
              <div className="flex flex-wrap items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
                <span className="text-sm text-text-primary">
                  {aiImportSummary.replayed
                    ? "That workout was already saved."
                    : `Added ${aiImportSummary.setsAdded} set${
                        aiImportSummary.setsAdded === 1 ? "" : "s"
                      }${
                        aiImportSummary.finished
                          ? " and finished the workout."
                          : ". Finish it when you are done."
                      }`}
                </span>
                <button
                  type="button"
                  onClick={() => setAiImportSummary(null)}
                  className="ml-auto text-sm text-text-muted hover:text-text-primary"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Hidden while the AI card is open — see aiFlowActive above. */}
            {!aiFlowActive && (
              <>
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
              </>
            )}
          </div>

          <div className="space-y-3 lg:col-span-7">
            {isLoading && (
              <div className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-32" />
            )}
            {/* Unfinished first: it is the thing most likely to be acted on,
                and it used to be invisible entirely. */}
            {unfinishedList}
            {sessionsList}
            {!isLoading &&
              completedSessions.length === 0 &&
              unfinishedSessions.length === 0 && (
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
        onSelect={(exercise) => setActiveExercise(exercise)}
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
