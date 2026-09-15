"use client";

/**
 * PWA Provider — service worker, install prompt, online state
 * ═══════════════════════════════════════════════════════════
 *
 * One place, mounted in the root layout, for the three browser features the
 * installable app depends on:
 *
 * 1. SERVICE WORKER REGISTRATION (production only)
 *    public/sw.js only serves an offline page. Registering it in `next dev`
 *    would add a worker to localhost that outlives the dev server and makes
 *    debugging confusing, for no benefit.
 *
 * 2. THE INSTALL PROMPT
 *    Chrome fires `beforeinstallprompt` once it decides the site is
 *    installable. We keep the event so an "Install app" button can show the
 *    native prompt later. The event can fire BEFORE React hydrates, so an
 *    inline script in the root layout (install-prompt-script.ts) stores it on
 *    window first; this provider picks it up on mount.
 *
 * 3. ONLINE / OFFLINE
 *    `navigator.onLine` is a hint, not proof: "online" only means a network
 *    interface is up (gym Wi-Fi with no internet still reads online). The
 *    offline banner uses it for wording; the set outbox never trusts it and
 *    simply retries.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PROMPT_READY_EVENT } from "./install-prompt-script";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __fitlogInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

interface PwaContextValue {
  isOnline: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  promptInstall: () => Promise<InstallOutcome>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeStandalone(onChange: () => void) {
  const media = window.matchMedia(STANDALONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  // Server render assumes online + not installed; the client corrects it
  // after hydration without a mismatch (useSyncExternalStore handles that).
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    () => window.matchMedia(STANDALONE_QUERY).matches,
    () => false
  );

  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const sync = () => setInstallPrompt(window.__fitlogInstallPrompt ?? null);
    sync();
    window.addEventListener(PROMPT_READY_EVENT, sync);
    return () => window.removeEventListener(PROMPT_READY_EVENT, sync);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        // Not fatal: the app works exactly as a website without the worker.
        console.warn("[pwa] service worker registration failed", error);
      });
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const prompt = window.__fitlogInstallPrompt;
    if (!prompt) return "unavailable";
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt can be shown only once; Chrome fires a new event if it may ask again.
    window.__fitlogInstallPrompt = null;
    setInstallPrompt(null);
    return outcome;
  }, []);

  return (
    <PwaContext.Provider
      value={{
        isOnline,
        isStandalone,
        canInstall: installPrompt !== null && !isStandalone,
        promptInstall,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa(): PwaContextValue {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used inside <PwaProvider>");
  return value;
}
