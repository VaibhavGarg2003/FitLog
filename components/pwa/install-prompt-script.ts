/**
 * Early capture of Chrome's install prompt
 * ════════════════════════════════════════
 *
 * `beforeinstallprompt` can fire before React hydrates, and a listener added
 * later misses it for that page load. This tiny script runs inline in the
 * root layout's <head>, stores the event on window, and signals
 * <PwaProvider> (components/pwa/pwa-provider.tsx) whenever it changes.
 *
 * Kept in a plain module (not "use client"): the root layout is a Server
 * Component and must import this as a real string.
 */

export const PROMPT_READY_EVENT = "fitlog:installprompt";

export const INSTALL_PROMPT_CAPTURE_SCRIPT = `
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  window.__fitlogInstallPrompt = e;
  window.dispatchEvent(new Event("${PROMPT_READY_EVENT}"));
});
window.addEventListener("appinstalled", function () {
  window.__fitlogInstallPrompt = null;
  window.dispatchEvent(new Event("${PROMPT_READY_EVENT}"));
});
`;
