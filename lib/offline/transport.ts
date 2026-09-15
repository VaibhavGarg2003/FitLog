/**
 * Offline set outbox — browser glue (network + lock)
 * ══════════════════════════════════════════════════
 *
 * The only parts of the outbox that touch fetch() and navigator.locks, kept
 * out of drain.ts so the logic stays testable in Node.
 */

import { parseRetryAfter, type SendResult } from "./drain";
import type { OutboxRecord } from "./outbox-types";
import { EXPECTED_USER_HEADER } from "@/lib/utils/expected-user";

/**
 * Longer than any normal response, and well under STALE_SENDING_MS, so a
 * record is never considered abandoned while its request can still land.
 */
export const SEND_TIMEOUT_MS = 20_000;
export const STALE_SENDING_MS = 60_000;

export async function sendSet(record: OutboxRecord): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/workout/${record.sessionId}/sets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Cookies are shared by every tab; this makes the server refuse (401)
        // if they now belong to someone other than the set's owner.
        [EXPECTED_USER_HEADER]: record.userId,
      },
      body: JSON.stringify(record.payload),
      signal: controller.signal,
    });
    const body = res.ok ? await res.json().catch(() => undefined) : undefined;
    return {
      kind: "response",
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers.get("Retry-After"), Date.now()),
      body,
    };
  } catch {
    // Offline, DNS failure, timeout (abort) — all "try again later".
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

const LOCK_NAME = "fitlog-outbox-drain";

/**
 * Run `task` only if no other tab is draining.
 *
 * Web Locks (every current browser, Android Chrome since v69) gives a true
 * cross-tab mutex. Where it's missing, only a VISIBLE tab drains and it stops
 * as soon as it's hidden — a best-effort guard; the server's idempotency and
 * max + 1 numbering cover the rest. Returns null when it did not run.
 */
export async function withDrainLock<T>(
  task: (shouldContinue: () => boolean) => Promise<T>
): Promise<T | null> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(
      LOCK_NAME,
      { ifAvailable: true },
      async (lock) => (lock ? task(() => true) : null)
    );
  }
  const visible = () =>
    typeof document === "undefined" || document.visibilityState === "visible";
  if (!visible()) return null;
  return task(visible);
}

/**
 * Like withDrainLock, but WAITS for a running drain to finish instead of
 * skipping. For user actions that rewrite the queue (recovering a workout),
 * which must never interleave with a send.
 */
export async function withDrainLockWaiting<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, task);
  }
  return task();
}
