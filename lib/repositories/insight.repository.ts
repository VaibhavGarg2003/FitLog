/**
 * Insight Repository — Raw Prisma Queries for Weekly AI Insights
 * ══════════════════════════════════════════════════════════════
 *
 * TABLES USED:
 * ────────────
 * WeeklyInsight — one per user per week (@@unique on userId + weekStart)
 *
 * WHY CACHE IN THE DATABASE?
 * ──────────────────────────
 * LLM calls are slow (~2-5 seconds) and rate-limited. Once we generate
 * an insight for a week, we save it. The next time the user opens the
 * progress page, we return the cached version instantly.
 */

import { prisma } from "@/lib/supabase/prisma";

/**
 * Get the most recent weekly insight for a user.
 */
export async function getLatestInsight(userId: string) {
  return prisma.weeklyInsight.findFirst({
    where: { userId },
    orderBy: { weekStart: "desc" },
  });
}

/**
 * Get insight for a specific week (check if already generated).
 */
export async function getInsightForWeek(userId: string, weekStart: Date) {
  return prisma.weeklyInsight.findUnique({
    where: {
      userId_weekStart: {
        userId,
        weekStart,
      },
    },
  });
}

/**
 * Save or update a weekly insight.
 * Uses upsert — if regenerated for the same week, overwrites.
 */
export async function saveInsight(
  userId: string,
  data: {
    weekStart: Date;
    content: string;
    highlights: string[];
    suggestion: string;
    provider: string;
    metadata: Record<string, string | number | boolean | null>;
  }
) {
  return prisma.weeklyInsight.upsert({
    where: {
      userId_weekStart: {
        userId,
        weekStart: data.weekStart,
      },
    },
    update: {
      content: data.content,
      highlights: data.highlights,
      suggestion: data.suggestion,
      provider: data.provider,
      metadata: data.metadata,
    },
    create: {
      userId,
      weekStart: data.weekStart,
      content: data.content,
      highlights: data.highlights,
      suggestion: data.suggestion,
      provider: data.provider,
      metadata: data.metadata,
    },
  });
}
