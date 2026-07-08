/**
 * OpenRouter AI Provider — Fallback #2
 * ═════════════════════════════════════
 *
 * Uses OpenRouter's OpenAI-compatible API.
 * OpenRouter aggregates 20+ free models — we use Google Gemma 4 (free).
 *
 * MODEL: google/gemma-4-26b-a4b-it:free
 * ─────
 * Google Gemma 4 26B — strong multilingual model, free on OpenRouter
 *
 * TEXT ONLY — cannot process images.
 */

const OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 6000;

interface OpenRouterRequest {
  systemPrompt: string;
  userMessage: string;
}

interface OpenRouterResponse {
  text: string;
  provider: "openrouter";
}

/**
 * Call OpenRouter (Gemma 4 26B) and return the raw text response.
 *
 * @throws Error if the API key is missing, call fails, or times out
 */
export async function callOpenRouter(
  request: OpenRouterRequest
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const body = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userMessage },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    // OpenRouter does not always support response_format for all models,
    // so we instruct JSON output in the system prompt instead.
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // OpenRouter requires an HTTP-Referer header for free models
        "HTTP-Referer": "https://fitlog.vercel.app",
        "X-Title": "FitLog",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    // Same OpenAI-compatible response structure as Groq
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("OpenRouter returned empty response");
    }

    return { text, provider: "openrouter" };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenRouter timed out after ${OPENROUTER_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
