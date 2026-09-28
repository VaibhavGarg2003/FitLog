/**
 * AI report time budget — one place, so the pieces can't drift apart
 * ═══════════════════════════════════════════════════════════════════
 *
 *   AI chain worst case (all three providers time out)   12 + 8 + 10 = 30 s
 *   generate route maxDuration (the platform kills it)                  60 s
 *   generation lease                                                    90 s
 *
 * The lease must OUTLIVE the route: a request can only lose its lease after
 * the platform has already killed it, so a slow-but-alive request (a slow
 * rate-limit check, a slow database) can never be overtaken by a second tap
 * that pays for a second AI call. The cost of a long lease is small — a
 * crashed request blocks that one report for 90 s, then frees itself.
 *
 * Next.js reads `maxDuration` from the route file statically, so the route
 * keeps a literal 60; a test checks it against REPORT_ROUTE_MAX_SECONDS.
 * Meal parsing keeps its own, shorter defaults (lib/ai/*.ts).
 */

export const REPORT_AI_TIMEOUTS_MS = { gemini: 12_000, groq: 8_000, openrouter: 10_000 } as const;
export const REPORT_ROUTE_MAX_SECONDS = 60;
export const LEASE_SECONDS = 90;
