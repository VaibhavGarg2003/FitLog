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
import { createClient } from "@/lib/supabase/server";
import { isUserOnboarded } from "@/lib/repositories/profile.repository";
import { OnboardingShell } from "./_components/onboarding-shell";

export const metadata: Metadata = { title: "Onboarding — FitLog" };

export default async function OnboardingPage() {
  // Check auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if already onboarded
  const onboarded = await isUserOnboarded(user.id);
  if (onboarded) {
    redirect("/dashboard");
  }

  return <OnboardingShell />;
}
