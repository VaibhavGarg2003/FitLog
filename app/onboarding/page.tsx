/**
 * Onboarding Page — Server Component
 * ════════════════════════════════════
 *
 * URL: /onboarding
 *
 * This is a Server Component (no "use client").
 * Its job: check if the user is already onboarded.
 *   - If yes → redirect to /dashboard
 *   - If no → render the wizard
 *
 * The actual wizard UI is in <OnboardingShell />, a Client Component,
 * because it needs useState, animations, and form state.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/supabase/server";
import { isUserOnboarded } from "@/lib/repositories/profile.repository";
import { OnboardingShell } from "./_components/onboarding-shell";

export const metadata: Metadata = { title: "Onboarding — FitLog" };

export default async function OnboardingPage() {
  // Check auth (local JWT verification, no network round-trip)
  const userId = await getAuthUserId();
  if (!userId) {
    redirect("/login");
  }

  // Check if already onboarded
  const onboarded = await isUserOnboarded(userId);
  if (onboarded) {
    redirect("/dashboard");
  }

  // userId lets the wizard confirm that any progress restored from
  // localStorage belongs to THIS user before resuming it.
  return <OnboardingShell userId={userId} />;
}
