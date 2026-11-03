/**
 * Chat retention — the nightly clean-up job
 * ══════════════════════════════════════════
 *
 * Chat history is kept 90 days (told to users in the chat UI). Once a day a
 * GitHub Actions cron calls POST /api/chat/retention, which deletes:
 *
 *   messages             older than 90 days  (bounded batches — never one
 *                                             giant DELETE holding locks)
 *   user_reports         older than 90 days  (with their evidence snapshot)
 *   buddy_request_events older than 2 days   (the quota only looks back 1)
 *   chat_ws_tickets      expired over 1 hour ago
 *
 * and reports the chat tables' size. Supabase's free plan has 500 MB for the
 * WHOLE database (fitness data included) and can go read-only past it, so
 * the job reports `overBudget` once chat uses more than CHAT_STORAGE_BUDGET_MB
 * (default 150 MB). The workflow then fails — GitHub emails the owner — long
 * before the limit, leaving time to shorten retention or pause writes
 * (CHAT_WRITES_PAUSED=true).
 *
 * Read markers are message ids, so deleting old messages never moves them.
 * A run that is cut short just continues the next night.
 */

import {
  chatStorageBytes,
  deleteExpiredWsTickets,
  deleteMessagesBefore,
} from "@/lib/repositories/chat.repository";
import {
  deleteReportsBefore,
  deleteRequestEventsBefore,
} from "@/lib/repositories/social.repository";

export const MESSAGE_RETENTION_DAYS = 90;
export const REPORT_RETENTION_DAYS = 90;
const REQUEST_EVENT_RETENTION_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 1000;
const MAX_BATCHES = 50;

export interface RetentionResult {
  deleted: { messages: number; reports: number; requestEvents: number; tickets: number };
  /** True when more old messages remain (batch limit reached) — the next run continues. */
  incomplete: boolean;
  chatBytes: number;
  databaseBytes: number;
  budgetBytes: number;
  overBudget: boolean;
}

export function storageBudgetBytes(): number {
  const mb = Number(process.env.CHAT_STORAGE_BUDGET_MB ?? "150");
  return (Number.isFinite(mb) && mb > 0 ? mb : 150) * 1024 * 1024;
}

export async function runChatRetention(now = new Date()): Promise<RetentionResult> {
  const messageCutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * DAY_MS);

  let messages = 0;
  let incomplete = false;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const deleted = await deleteMessagesBefore(messageCutoff, BATCH_SIZE);
    messages += deleted;
    if (deleted < BATCH_SIZE) break;
    if (batch === MAX_BATCHES - 1) incomplete = true;
  }

  const reports = await deleteReportsBefore(new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS));
  const requestEvents = await deleteRequestEventsBefore(
    new Date(now.getTime() - REQUEST_EVENT_RETENTION_DAYS * DAY_MS)
  );
  const tickets = await deleteExpiredWsTickets(new Date(now.getTime() - 60 * 60 * 1000));

  const storage = await chatStorageBytes();
  const budgetBytes = storageBudgetBytes();
  return {
    deleted: { messages, reports, requestEvents, tickets },
    incomplete,
    chatBytes: storage.chat,
    databaseBytes: storage.database,
    budgetBytes,
    overBudget: storage.chat > budgetBytes,
  };
}
