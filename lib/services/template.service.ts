/**
 * Template Service — Business Logic for Workout Templates
 * ═════════════════════════════════════════════════════════
 *
 * TWO FLOWS:
 * ──────────
 * 1. SAVE: a finished session → template. The exercise list is derived
 *    SERVER-SIDE from the session's actual sets (unique exercises, in
 *    first-performed order, with how many sets were done). The client
 *    sends only { name, fromSessionId } — it cannot fabricate a payload.
 * 2. START: template → a fresh RECALL session for a given date, plus the
 *    template's exercise list so the UI can present a planned checklist.
 */

import {
  createTemplate,
  getTemplatesByUser,
  findTemplateForUser,
  deleteTemplateForUser,
  type TemplateExercise,
} from "@/lib/repositories/template.repository";
import { findSessionForUser } from "@/lib/repositories/workout.repository";
import { startSession } from "@/lib/services/workout.service";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";

/**
 * Save a completed session as a reusable template.
 * Derives unique exercises (first-performed order) + working-set counts.
 */
export async function createTemplateFromSession(
  userId: string,
  data: { name: string; sessionId: string }
) {
  const session = await findSessionForUser(data.sessionId, userId);
  if (!session) throw new NotFoundError("Session not found");

  if (session.exerciseSets.length === 0) {
    throw new ValidationError(
      "This session has no sets — log some exercises before saving it as a template."
    );
  }

  // Derive: unique exercises in first-appearance order, counting
  // WORKING sets only (warmups aren't part of the plan).
  const byExercise = new Map<string, TemplateExercise>();
  for (const set of session.exerciseSets) {
    const existing = byExercise.get(set.exercise.id);
    if (existing) {
      if (!set.isWarmup) existing.targetSets += 1;
    } else {
      byExercise.set(set.exercise.id, {
        exerciseId: set.exercise.id,
        name: set.exercise.name,
        muscleGroup: set.exercise.muscleGroup,
        category: set.exercise.category,
        metValue: set.exercise.metValue,
        isCompound: set.exercise.isCompound,
        targetSets: set.isWarmup ? 0 : 1,
      });
    }
  }

  // An all-warmup exercise still belongs in the plan — floor at 1 set.
  const exercises = [...byExercise.values()].map((e) => ({
    ...e,
    targetSets: Math.max(e.targetSets, 1),
  }));

  return createTemplate(userId, {
    name: data.name,
    splitType: session.splitType,
    exercises,
  });
}

/** All of the user's templates, newest first. */
export async function listTemplates(userId: string) {
  return getTemplatesByUser(userId);
}

/** Delete (owner-scoped — a non-owner id reads as "not found"). */
export async function removeTemplate(userId: string, templateId: string) {
  const deleted = await deleteTemplateForUser(templateId, userId);
  if (!deleted) throw new NotFoundError("Template not found");
  return { deleted: true };
}

/**
 * Start a new RECALL session from a template.
 * Returns the created session AND the template's planned exercises —
 * the UI renders them as a checklist to log through.
 */
export async function startSessionFromTemplate(
  userId: string,
  templateId: string,
  date: string
) {
  const template = await findTemplateForUser(templateId, userId);
  if (!template) throw new NotFoundError("Template not found");

  const session = await startSession(userId, {
    date,
    mode: "RECALL",
    splitType: template.splitType ?? undefined,
  });

  return {
    session,
    templateName: template.name,
    exercises: template.exercises as unknown as TemplateExercise[],
  };
}
