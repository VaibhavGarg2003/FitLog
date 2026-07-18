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
  updateTemplateForUser,
  type TemplateExercise,
} from "@/lib/repositories/template.repository";
import { findSessionForUser } from "@/lib/repositories/workout.repository";
import { startSession } from "@/lib/services/workout.service";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";

/**
 * Derive template exercises from a session's real sets: unique exercises in
 * first-appearance order, counting WORKING sets only (warmups aren't part of
 * the plan; an all-warmup exercise still floors at 1 set). When `exerciseIds`
 * is given, only those exercises are kept — this is how one session splits into
 * multiple templates (e.g. biceps vs triceps). Shared by create + append.
 */
async function deriveExercisesFromSession(
  userId: string,
  sessionId: string,
  exerciseIds?: string[]
): Promise<{
  exercises: TemplateExercise[];
  splitType: "PPL" | "UPPER_LOWER" | "BRO" | "FULL_BODY" | "CUSTOM" | null;
}> {
  const session = await findSessionForUser(sessionId, userId);
  if (!session) throw new NotFoundError("Session not found");

  if (session.exerciseSets.length === 0) {
    throw new ValidationError(
      "This session has no sets — log some exercises before saving it as a template."
    );
  }

  const allow = exerciseIds ? new Set(exerciseIds) : null;

  const byExercise = new Map<string, TemplateExercise>();
  for (const set of session.exerciseSets) {
    if (allow && !allow.has(set.exercise.id)) continue;
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

  const exercises = [...byExercise.values()].map((e) => ({
    ...e,
    targetSets: Math.max(e.targetSets, 1),
  }));

  if (exercises.length === 0) {
    throw new ValidationError(
      "None of the selected exercises were found in this session."
    );
  }

  return { exercises, splitType: session.splitType };
}

/**
 * Save a session (or a chosen subset of its exercises) as a reusable template.
 */
export async function createTemplateFromSession(
  userId: string,
  data: { name: string; sessionId: string; exerciseIds?: string[] }
) {
  const { exercises, splitType } = await deriveExercisesFromSession(
    userId,
    data.sessionId,
    data.exerciseIds
  );

  return createTemplate(userId, {
    name: data.name,
    splitType,
    exercises,
  });
}

/**
 * Append a session's exercises (or a chosen subset) to an EXISTING template.
 * Exercises already in the template are skipped (dedup by exerciseId), so the
 * user's existing target-set counts are preserved. Owner-scoped throughout.
 */
export async function appendSessionToTemplate(
  userId: string,
  templateId: string,
  data: { sessionId: string; exerciseIds?: string[] }
) {
  const template = await findTemplateForUser(templateId, userId);
  if (!template) throw new NotFoundError("Template not found");

  const { exercises: incoming } = await deriveExercisesFromSession(
    userId,
    data.sessionId,
    data.exerciseIds
  );

  const current = template.exercises as unknown as TemplateExercise[];
  const currentIds = new Set(current.map((e) => e.exerciseId));
  const additions = incoming.filter((e) => !currentIds.has(e.exerciseId));
  const merged = [...current, ...additions].slice(0, 20);

  const updated = await updateTemplateForUser(templateId, userId, {
    name: template.name,
    exercises: merged,
  });
  if (!updated) throw new NotFoundError("Template not found");
  return { updated: true, added: additions.length };
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
 * Edit a template: rename and/or reshape its exercise list (add/remove
 * exercises, change target sets). The exercises payload arrives validated
 * by updateTemplateSchema; the write is owner-scoped.
 */
export async function editTemplate(
  userId: string,
  templateId: string,
  data: { name: string; exercises: TemplateExercise[] }
) {
  const updated = await updateTemplateForUser(templateId, userId, data);
  if (!updated) throw new NotFoundError("Template not found");
  return { updated: true };
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
