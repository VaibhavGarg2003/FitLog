/**
 * Offline set outbox — shared types
 * ═════════════════════════════════
 *
 * One OutboxRecord = one set the user logged that the server has not yet
 * confirmed. See outbox-store.ts for storage and drain.ts for sending.
 */

/** Enough of the exercise to render a pending set without the server. */
export interface ExerciseSnapshot {
  id: string;
  name: string;
  muscleGroup: string;
  category: string;
  metValue: number;
  isCompound: boolean;
}

/** Exactly what POST /api/workout/[id]/sets receives. Never edited after enqueue. */
export interface SetPayload {
  exerciseId: string;
  /** Advisory only — the server derives the real number (max + 1). */
  setNumber: number;
  weight: number;
  reps: number;
  rpe?: number;
  isWarmup: boolean;
  clientRequestId: string;
}

/**
 * pending — waiting to be sent (possibly not before nextAttemptAt)
 * sending — claimed by the drainer; a request may be in flight
 * failed  — the server refused it; needs the user (recover or discard)
 */
export type OutboxStatus = "pending" | "sending" | "failed";

/**
 * gone     — 404: the workout was finished, discarded or removed. Recoverable
 *            by saving the sets into a new workout.
 * rejected — any other 4xx: the server will never accept this payload.
 */
export type FailureKind = "gone" | "rejected";

export interface OutboxFailure {
  kind: FailureKind;
  status: number;
}

export interface OutboxRecord {
  /** Primary key. Also the server's idempotency key for this set. */
  clientRequestId: string;
  userId: string;
  sessionId: string;
  /** The workout's calendar date, "YYYY-MM-DD" (the sessions query key). */
  date: string;
  exercise: ExerciseSnapshot;
  payload: SetPayload;
  /** Strictly increasing across tabs (allocated in the same IDB transaction). */
  seq: number;
  createdAt: number;
  status: OutboxStatus;
  attempts: number;
  /** Epoch ms before which this record (and later ones in its session) wait. */
  nextAttemptAt: number;
  /** When the drainer claimed it; used to recover from a tab that died mid-send. */
  sendingSince?: number;
  /**
   * Waiting because the server said "not signed in" (or signed in as someone
   * else). Released when the app shell mounts again after signing in; other
   * backoffs (network, Retry-After) are left to run their course.
   */
  authPaused?: boolean;
  failure?: OutboxFailure;
}

export interface EnqueueInput {
  userId: string;
  sessionId: string;
  date: string;
  exercise: ExerciseSnapshot;
  payload: SetPayload;
}
