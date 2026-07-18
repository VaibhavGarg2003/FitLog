/**
 * Template Hooks — TanStack Query
 * ════════════════════════════════
 *
 * useTemplates()          — list my workout templates
 * useSaveTemplate()       — save a completed session as a template
 * useDeleteTemplate()     — delete a template
 * useStartFromTemplate()  — start a session pre-planned from a template
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface TemplateExercise {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  category: string;
  metValue: number;
  isCompound: boolean;
  targetSets: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  splitType: string | null;
  exercises: TemplateExercise[];
  createdAt: string;
}

const TEMPLATES_KEY = ["workout", "templates"] as const;

export function useTemplates() {
  return useQuery<WorkoutTemplate[]>({
    queryKey: TEMPLATES_KEY,
    queryFn: async () => {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      return data.templates;
    },
    // Templates change only via our own mutations (which invalidate).
    staleTime: 10 * 60 * 1000,
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      fromSessionId: string;
      // Optional subset of the session's exercises (for split templates).
      exerciseIds?: string[];
    }) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save template");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useAppendToTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      templateId: string;
      fromSessionId: string;
      exerciseIds?: string[];
    }) => {
      const { templateId, ...payload } = data;
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/append`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add to template");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      templateId: string;
      name: string;
      exercises: TemplateExercise[];
    }) => {
      const { templateId, ...payload } = data;
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update template");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useStartFromTemplate(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start from template");
      return json as {
        session: { id: string };
        templateName: string;
        exercises: TemplateExercise[];
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
    },
  });
}
