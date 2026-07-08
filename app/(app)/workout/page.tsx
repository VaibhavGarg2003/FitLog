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
import { DateStrip } from "../dashboard/_components/date-strip";
import { ExerciseBrowser } from "./_components/exercise-browser";
import { SetLogger } from "./_components/set-logger";
import { SessionSummary } from "./_components/session-summary";

export default function WorkoutPage() {
  const selectedDate = useUIStore((s) => s.selectedDate);
  const { data: sessions, isLoading } = useWorkoutsForDate(selectedDate);
  const startSession = useStartSession(selectedDate);
  const logSet = useLogSet(selectedDate);
  const finishSession = useFinishSession(selectedDate);

  const [showBrowser, setShowBrowser] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
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

  // totalSetsInSession = total sets logged across ALL exercises this session
  // This persists across exercise changes — used to validate before finishing
  const [totalSetsInSession, setTotalSetsInSession] = useState(0);

  const [showFinish, setShowFinish] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [duration, setDuration] = useState("45");

  // After a successful finish, show a completion screen instead of blank page
  const [workoutCompleted, setWorkoutCompleted] = useState<{
    exerciseCount: number;
    totalSets: number;
    durationMin: number;
  } | null>(null);

  async function handleStartSession() {
    try {
      const session = await startSession.mutateAsync({
        mode: "RECALL",
      });
      setActiveSessionId(session.id);
      setTotalSetsInSession(0);
      setWorkoutCompleted(null);
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
    if (!activeSessionId || !activeExercise) return;
    try {
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
      setTotalSetsInSession((prev) => prev + 1);
    } catch {
      // Error handled by TanStack Query
    }
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
        exerciseCount: Math.max(exerciseCount, 1),
        totalSets: totalSetsInSession,
        durationMin,
      });

      // Reset all session state
      setActiveSessionId(null);
      setActiveExercise(null);
      setSetsLogged(0);
      setTotalSetsInSession(0);
      setShowFinish(false);
    } catch {
      // Error handled by TanStack Query
    }
  }

  const completedSessions = sessions?.filter(
    (s: { status: string }) => s.status === "COMPLETED"
  ) ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Workout
        </h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Log your gym session
        </p>
      </div>

      <DateStrip />

      {/* Active Session */}
      {activeSessionId ? (
        <div className="space-y-4">
          {activeExercise ? (
            <SetLogger
              exerciseName={activeExercise.name}
              setsLogged={setsLogged}
              isPending={logSet.isPending}
              onLogSet={handleLogSet}
              onDone={() => {
                setActiveExercise(null);
                setSetsLogged(0);
              }}
            />
          ) : showFinish ? (
            /* Fix 7: Duration screen — now has a Back button */
            <div className="bg-surface rounded-2xl border border-border p-4 space-y-4">
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
            /* Fix 6: Validate before showing finish screen */
            <div className="space-y-3">
              <p className="text-xs text-text-muted">
                {totalSetsInSession} set{totalSetsInSession !== 1 ? "s" : ""} logged
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
              {/* Error when user tries to finish with 0 sets */}
              {finishError && (
                <p className="text-sm text-red-400 text-center">{finishError}</p>
              )}
            </div>
          )}
        </div>
      ) : workoutCompleted ? (
        /* Fix 5: Workout completion card — shown instead of blank page */
        <div className="bg-surface rounded-2xl border border-primary/30 p-6 space-y-4 text-center"
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
          <button
            type="button"
            onClick={() => setWorkoutCompleted(null)}
            className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        /* Start Session Button */
        <button
          type="button"
          onClick={handleStartSession}
          disabled={startSession.isPending}
          className="w-full py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-hover disabled:opacity-50 transition-colors text-lg shadow-md"
          style={{ boxShadow: "0 4px 20px rgba(34, 197, 94, 0.3)" }}
        >
          {startSession.isPending ? "Starting..." : "🏋️ Start Workout"}
        </button>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-32" />
      )}

      {/* Completed Sessions */}
      {completedSessions.length > 0 && (
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
              exercise: { name: string; muscleGroup: string };
            }>;
          }) => (
            <SessionSummary key={session.id} session={session} />
          ))}
        </div>
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
    </div>
  );
}
