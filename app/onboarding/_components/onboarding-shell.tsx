"use client";

/**
 * Onboarding Shell — Wizard Container
 * ═════════════════════════════════════
 *
 * Controls the 5-step flow:
 * - Full-viewport app chrome (matches authenticated pages)
 * - Progress bar edge-to-edge under the top bar
 * - Laptop: left rail with step context + right form panel
 * - Phone: stacked title + form (same content, denser)
 * - Handles the final submission
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingSchema } from "@/lib/validators/onboarding.schema";
import { APP_NAME } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { Step1Identity } from "./step-1-identity";
import { Step2Body } from "./step-2-body";
import { Step3Activity } from "./step-3-activity";
import { Step4Goal } from "./step-4-goal";
import { Step5Preferences } from "./step-5-preferences";

const STEPS = [
  {
    title: "Who are you?",
    subtitle: "A few basics so we can personalize FitLog for you.",
  },
  {
    title: "Your body",
    subtitle: "Weight and height power accurate calorie and macro targets.",
  },
  {
    title: "Activity level",
    subtitle: "Be honest — this drives your daily calorie budget.",
  },
  {
    title: "Your goal",
    subtitle: "Tell us the body outcome you want and a realistic timeline.",
  },
  {
    title: "Preferences",
    subtitle: "Diet style and how direct you want coaching feedback.",
  },
] as const;

export function OnboardingShell({ userId }: { userId: string }) {
  const router = useRouter();
  const { currentStep, formData, hasHydrated, setStep } = useOnboardingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore saved progress. This runs in an effect rather than at module scope
  // so the first client render still matches the server HTML — see the
  // skipHydration note in stores/onboarding-store.ts.
  useEffect(() => {
    let cancelled = false;

    Promise.resolve(useOnboardingStore.persist.rehydrate()).finally(() => {
      if (cancelled) return;
      // Discard the restored progress if it belongs to a different account.
      useOnboardingStore.getState().claimForUser(userId);
      // Set last, and even if the read threw, so a storage failure degrades to
      // a fresh wizard instead of a permanent loading state.
      useOnboardingStore.getState().setHasHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const stepMeta = STEPS[currentStep - 1] ?? STEPS[0];
  const progressPct = hasHydrated ? (currentStep / STEPS.length) * 100 : 0;

  async function handleSubmit() {
    setError(null);

    // Validate the complete form data
    const validation = onboardingSchema.safeParse(formData);
    if (!validation.success) {
      const firstError = Object.values(
        validation.error.flatten().fieldErrors
      )[0]?.[0];
      setError(firstError || "Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }

      // Success. Do NOT call reset() here — it sets currentStep back to 1 while
      // this page is still mounted, which flashes step 1 for a frame before
      // navigation. Wipe localStorage only, leave in-memory step at 5 so the
      // "Saving..." UI stays put until /dashboard takes over.
      await useOnboardingStore.persist.clearStorage();
      router.replace("/dashboard");
      router.refresh(); // Re-run server components to pick up new profile
      // Keep isSubmitting true so the button doesn't re-enable mid-transition.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full min-h-dvh bg-background flex flex-col">
      {/* ── Full-width top bar (matches app chrome) ── */}
      <header className="sticky top-0 z-40 w-full bg-surface/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between h-14 w-full px-4 sm:px-6 lg:px-8 xl:px-10">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Dumbbell className="text-primary" size={24} />
            <span className="text-lg font-bold font-[family-name:var(--font-outfit)]">
              {APP_NAME}
            </span>
          </Link>
          <div className="text-sm text-text-secondary">
            <span className="hidden sm:inline">Setup</span>
            {hasHydrated && (
              <>
                <span className="hidden sm:inline"> · </span>
                <span className="font-semibold text-text-primary">
                  Step {currentStep}
                </span>
                <span className="text-text-muted"> / {STEPS.length}</span>
              </>
            )}
          </div>
        </div>
        {/* Edge-to-edge progress track */}
        <div className="h-1 w-full bg-border">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* ── Saved progress is still being read ──
          Rendering the wizard here would flash step 1 at a user who left off
          on step 3, which is the exact jolt this whole feature avoids. */}
      {!hasHydrated && (
        <main
          className="w-full flex-1 px-4 sm:px-6 lg:px-8 xl:px-10 py-6 lg:py-10"
          aria-busy="true"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10 lg:items-start">
            <div className="hidden lg:block lg:col-span-4 xl:col-span-3">
              <div className="h-64 rounded-2xl bg-surface/40 animate-pulse" />
            </div>
            <div className="lg:col-span-8 xl:col-span-9">
              <div className="h-96 rounded-2xl border border-border bg-surface/40 animate-pulse" />
            </div>
          </div>
        </main>
      )}

      {/* ── Full-width main ── */}
      {hasHydrated && (
      <main className="w-full flex-1 px-4 sm:px-6 lg:px-8 xl:px-10 py-6 lg:py-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10 lg:items-start">
          {/* Left rail — context on laptop so the form doesn't float alone */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3">
            <div className="sticky top-24 space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                  Get started
                </p>
                <h1 className="text-3xl font-bold font-[family-name:var(--font-outfit)] text-text-primary leading-tight">
                  {stepMeta.title}
                </h1>
                <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                  {stepMeta.subtitle}
                </p>
              </div>

              <ol className="space-y-2">
                {STEPS.map((step, i) => {
                  const n = i + 1;
                  const done = n < currentStep;
                  const active = n === currentStep;
                  // Only steps already reached hold saved answers worth
                  // jumping back to — steps ahead aren't filled in yet.
                  const reachable = n <= currentStep;
                  return (
                    <li key={step.title}>
                      <button
                        type="button"
                        disabled={!reachable}
                        onClick={() => setStep(n)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors text-left",
                          active
                            ? "border-primary/40 bg-primary/10"
                            : done
                              ? "border-border bg-surface"
                              : "border-border/60 bg-surface/40",
                          reachable
                            ? "cursor-pointer hover:border-primary/40"
                            : "cursor-not-allowed"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            active
                              ? "bg-primary text-white"
                              : done
                                ? "bg-primary/20 text-primary"
                                : "bg-border text-text-muted"
                          )}
                        >
                          {done ? "✓" : n}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            active
                              ? "text-primary"
                              : done
                                ? "text-text-primary"
                                : "text-text-muted"
                          )}
                        >
                          {step.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>

          {/* Form panel — fills remaining width on laptop */}
          <div className="lg:col-span-8 xl:col-span-9">
            {/* Mobile/tablet title (desktop uses the left rail) */}
            <div className="mb-6 lg:hidden">
              <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)] text-text-primary">
                {stepMeta.title}
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                {stepMeta.subtitle}
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 lg:p-8">
              {currentStep === 1 && <Step1Identity />}
              {currentStep === 2 && <Step2Body />}
              {currentStep === 3 && <Step3Activity />}
              {currentStep === 4 && <Step4Goal />}
              {currentStep === 5 && (
                <Step5Preferences
                  onSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                />
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 lg:p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </main>
      )}
    </div>
  );
}
