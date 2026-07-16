/**
 * Onboarding persistence tests.
 *
 * The bug these lock down: reloading mid-wizard dropped the user back on
 * step 1 with an empty form. A "reload" here is simulated by resetting the
 * module registry and re-importing the store against the same backing
 * localStorage — a fresh store instance, the same saved bytes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const USER_A = "user-aaaa-1111";
const USER_B = "user-bbbb-2222";

/** Fresh store instance reading whatever is currently in localStorage. */
async function reload() {
  vi.resetModules();
  const { useOnboardingStore } = await import("./onboarding-store");
  await useOnboardingStore.persist.rehydrate();
  return useOnboardingStore;
}

describe("onboarding store persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the step and answers the user left off on", async () => {
    const store = await reload();
    store.getState().claimForUser(USER_A);
    store.getState().updateFormData({ name: "Vaibhav", sex: "MALE" });
    store.getState().setStep(3);

    // ── reload ──
    const reloaded = await reload();
    reloaded.getState().claimForUser(USER_A);

    expect(reloaded.getState().currentStep).toBe(3);
    expect(reloaded.getState().formData.name).toBe("Vaibhav");
    expect(reloaded.getState().formData.sex).toBe("MALE");
  });

  it("keeps defaults that were never touched", async () => {
    const store = await reload();
    store.getState().claimForUser(USER_A);
    store.getState().setStep(4);

    const reloaded = await reload();
    reloaded.getState().claimForUser(USER_A);

    expect(reloaded.getState().formData.strictness).toBe("MODERATE");
    expect(reloaded.getState().formData.unitSystem).toBe("METRIC");
  });

  it("discards progress belonging to a different account", async () => {
    const store = await reload();
    store.getState().claimForUser(USER_A);
    store.getState().updateFormData({ name: "Vaibhav", weightKg: 72 });
    store.getState().setStep(3);

    // Someone else signs up in the same browser.
    const reloaded = await reload();
    reloaded.getState().claimForUser(USER_B);

    expect(reloaded.getState().currentStep).toBe(1);
    expect(reloaded.getState().formData.name).toBeUndefined();
    expect(reloaded.getState().formData.weightKg).toBeUndefined();
  });

  it("does not resurrect answers after a completed onboarding", async () => {
    const store = await reload();
    store.getState().claimForUser(USER_A);
    store.getState().updateFormData({ name: "Vaibhav" });
    store.getState().setStep(5);
    // handleSubmit clears storage only (not reset()) so the UI never flashes
    // step 1 while still on /onboarding during the dashboard redirect.
    await store.persist.clearStorage();

    const reloaded = await reload();
    reloaded.getState().claimForUser(USER_A);

    expect(reloaded.getState().currentStep).toBe(1);
    expect(reloaded.getState().formData.name).toBeUndefined();
  });

  it("starts clean when storage holds unreadable junk", async () => {
    localStorage.setItem("fitlog-onboarding-progress", "{not json");

    const reloaded = await reload();
    reloaded.getState().claimForUser(USER_A);

    expect(reloaded.getState().currentStep).toBe(1);
  });
});
