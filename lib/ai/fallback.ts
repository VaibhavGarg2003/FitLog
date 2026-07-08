/**
 * AI Fallback Chain — Cascading Provider Strategy
 * ════════════════════════════════════════════════
 *
 * THE PROBLEM:
 * ────────────
 * Free-tier LLM APIs have rate limits and occasional downtime.
 * If Gemini is rate-limited or slow, we try Groq. If Groq fails, OpenRouter.
 * If all fail, we return a graceful error — never crash the app.
 *
 * THE CHAIN:
 * ──────────
 * 1. Gemini 3.1 Flash Lite (primary — best quality, multimodal)
 * 2. Groq Llama 3.3 70B (fast fallback — text only)
 * 3. OpenRouter DeepSeek Chat (second fallback — text only)
 *
 * SKIPPING RULES:
 * ───────────────
 * - Provider is skipped if its API key is empty/missing
 * - Provider is skipped if request requires images and provider is text-only
 * - Each provider has its own timeout (Gemini 8s, Groq 4s, OpenRouter 6s)
 */

import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callOpenRouter } from "./openrouter";

export type AIProvider = "gemini" | "groq" | "openrouter";

export interface FallbackRequest {
  systemPrompt: string;
  userMessage: string;
  /** If true, only Gemini is tried (Groq/OpenRouter cannot handle images) */
  requiresMultimodal?: boolean;
  /** Base64-encoded image data (for Gemini multimodal) */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface FallbackSuccess {
  ok: true;
  text: string;
  provider: AIProvider;
}

export interface FallbackFailure {
  ok: false;
  error: string;
  /** Which providers were attempted and why they failed */
  attempts: Array<{ provider: AIProvider; error: string }>;
}

export type FallbackResult = FallbackSuccess | FallbackFailure;

/**
 * Run the AI fallback chain.
 *
 * Tries each provider in order: Gemini → Groq → OpenRouter.
 * Skips providers with missing API keys.
 * Returns the first successful result.
 */
export async function runWithFallback(
  request: FallbackRequest
): Promise<FallbackResult> {
  const attempts: Array<{ provider: AIProvider; error: string }> = [];

  // ── Provider 1: Gemini (Primary) ──
  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await callGemini({
        systemPrompt: request.systemPrompt,
        userMessage: request.userMessage,
        imageBase64: request.imageBase64,
        imageMimeType: request.imageMimeType,
      });
      return { ok: true, text: result.text, provider: result.provider };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      attempts.push({ provider: "gemini", error: msg });
      console.warn(`[AI Fallback] Gemini failed: ${msg}`);
    }
  } else {
    attempts.push({ provider: "gemini", error: "API key not configured" });
  }

  // If the request requires multimodal (images), stop here.
  // Groq and OpenRouter cannot process images.
  if (request.requiresMultimodal) {
    return {
      ok: false,
      error: "Image processing is only available with Gemini. Please describe your meal in text instead.",
      attempts,
    };
  }

  // ── Provider 2: Groq (Fast Fallback) ──
  if (process.env.GROQ_API_KEY) {
    try {
      const result = await callGroq({
        systemPrompt: request.systemPrompt,
        userMessage: request.userMessage,
      });
      return { ok: true, text: result.text, provider: result.provider };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      attempts.push({ provider: "groq", error: msg });
      console.warn(`[AI Fallback] Groq failed: ${msg}`);
    }
  } else {
    attempts.push({ provider: "groq", error: "API key not configured" });
  }

  // ── Provider 3: OpenRouter (Last Resort) ──
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const result = await callOpenRouter({
        systemPrompt: request.systemPrompt,
        userMessage: request.userMessage,
      });
      return { ok: true, text: result.text, provider: result.provider };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      attempts.push({ provider: "openrouter", error: msg });
      console.warn(`[AI Fallback] OpenRouter failed: ${msg}`);
    }
  } else {
    attempts.push({ provider: "openrouter", error: "API key not configured" });
  }

  // ── All Failed ──
  return {
    ok: false,
    error: "All AI providers failed. Please log your meal manually using the search.",
    attempts,
  };
}
