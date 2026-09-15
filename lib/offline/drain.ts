/**
 * Offline set outbox — the drainer
 * ════════════════════════════════
 *
 * Sends queued sets to the server one at a time, oldest first, and decides
 * what each response means. Pure and injectable (store, transport, clock) so
 * every branch is unit-tested without a browser or a server.
 *
 * WHAT EACH RESPONSE MEANS:
 * ─────────────────────────
 *   2xx                     saved → patch the UI cache, then delete the record
 *   network error, 408, 425,
 *   429, 5xx                temporary → retry later with backoff, stop this pass
 *   401                     logged out, or signed in as someone else (see
 *                           lib/utils/expected-user.ts) → park 60s, no attempt
 *                           counted, stop, ask to sign in
 *   404                     the workout is gone → failed "gone" (recoverable)
 *   any other 4xx           the server will never accept it → failed "rejected"
 *
 * WHY A TEMPORARY FAILURE STOPS THE WHOLE PASS:
 * ─────────────────────────────────────────────
 * No signal means every request would fail; hammering them all wastes battery.
 * The backoff time is stored on the record (nextAttemptAt), so every trigger —
 * reconnect, app focus, a timer — respects it instead of retrying instantly.
 */

import type { OutboxStore } from "./outbox-store";
import type { OutboxRecord } from "./outbox-types";

export type SendResult =
  | { kind: "network" }
  | { kind: "response"; status: number; retryAfterMs?: number; body?: unknown };

export type ResponseClass = "ok" | "retry" | "auth" | "gone" | "rejected";

export function classifyStatus(status: number): ResponseClass {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth";
  if (status === 404) return "gone";
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return "retry";
  }
  return "rejected";
}

const BACKOFF_STEPS_MS = [2_000, 5_000, 15_000, 60_000];
/** How long a 401 parks a set before the next check. */
export const AUTH_PAUSE_MS = 60_000;
const MAX_RETRY_AFTER_MS = 10 * 60_000;

/** Delay before retry number `attempts + 1`. */
export function backoffMs(attempts: number): number {
  return BACKOFF_STEPS_MS[Math.min(attempts, BACKOFF_STEPS_MS.length - 1)];
}

/** Parse a Retry-After header (seconds or HTTP date) into ms from `now`. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS);
}

export interface DrainDeps {
  store: OutboxStore;
  userId: string;
  send: (record: OutboxRecord) => Promise<SendResult>;
  /**
   * Make the saved set visible in the UI BEFORE its record is deleted, so it
   * never flickers out of the list. Throwing keeps the record for a retry
   * (the replay is idempotent, so resending is harmless).
   */
  onSynced: (record: OutboxRecord, serverRow: unknown) => Promise<void>;
  now?: () => number;
  /** Checked before every claim; false stops the pass (e.g. tab hidden). */
  shouldContinue?: () => boolean;
}

export type StopReason = "idle" | "retry-later" | "needs-login" | "stopped";

export interface DrainOutcome {
  synced: number;
  failed: number;
  stopReason: StopReason;
}

/** Hard cap so a logic bug can never spin forever. */
const MAX_PER_PASS = 500;

export async function drainOutbox(deps: DrainDeps): Promise<DrainOutcome> {
  const now = deps.now ?? Date.now;
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < MAX_PER_PASS; i++) {
    if (deps.shouldContinue && !deps.shouldContinue()) {
      return { synced, failed, stopReason: "stopped" };
    }

    const record = await deps.store.claimNext(deps.userId, now());
    if (!record) return { synced, failed, stopReason: "idle" };

    const id = record.clientRequestId;
    const result = await deps.send(record);

    // The owner went away mid-request (signed out, provider unmounted). The
    // response may have been produced under someone else's cookies, so don't
    // interpret it: put the set back untouched. A later replay is idempotent.
    if (deps.shouldContinue && !deps.shouldContinue()) {
      await deps.store.scheduleRetry(id, 0, false);
      return { synced, failed, stopReason: "stopped" };
    }

    if (result.kind === "network") {
      await deps.store.scheduleRetry(id, now() + backoffMs(record.attempts), true);
      return { synced, failed, stopReason: "retry-later" };
    }

    switch (classifyStatus(result.status)) {
      case "ok":
        try {
          await deps.onSynced(record, result.body);
        } catch {
          await deps.store.scheduleRetry(id, now() + backoffMs(record.attempts), true);
          return { synced, failed, stopReason: "retry-later" };
        }
        await deps.store.markSucceeded(id);
        synced++;
        break;

      case "auth":
        // Not the set's fault — don't count it toward backoff — but do wait:
        // retrying a logged-out request every second helps no one. Signing in
        // again remounts the app shell, which drains immediately.
        await deps.store.scheduleRetry(id, now() + AUTH_PAUSE_MS, false, true);
        return { synced, failed, stopReason: "needs-login" };

      case "gone":
        await deps.store.markFailed(id, { kind: "gone", status: result.status });
        failed++;
        break;

      case "rejected":
        await deps.store.markFailed(id, { kind: "rejected", status: result.status });
        failed++;
        break;

      case "retry": {
        const delay = result.retryAfterMs ?? backoffMs(record.attempts);
        await deps.store.scheduleRetry(id, now() + delay, true);
        return { synced, failed, stopReason: "retry-later" };
      }
    }
  }

  return { synced, failed, stopReason: "stopped" };
}
