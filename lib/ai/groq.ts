/**
 * Groq AI Provider — Fast Fallback #1
 * ════════════════════════════════════
 *
 * Uses Groq's OpenAI-compatible API.
 * Groq runs models on custom LPU hardware — responses in < 500ms.
 *
 * MODEL: llama-3.3-70b-versatile
 * ─────
 * 70B parameters — large enough for accurate food parsing
 * Free tier: 6,000 tokens/min, 30 RPM
 *
 * WHY OPENAI-COMPATIBLE?
 * ──────────────────────
 * Groq, OpenRouter, and many others use the same API format as OpenAI.
 * This means the request body structure is identical:
 *   { model, messages: [{ role, content }], ... }
 * This makes it trivial to swap between providers.
 *
 * TEXT ONLY — cannot process images.
 * If the user uploads a photo, this provider is skipped.
 */

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
// Part of the 8s chain budget (Gemini 4s + Groq 2s + OpenRouter 2s) — see
// gemini.ts for the full derivation from the Vercel 10s ceiling.
const GROQ_TIMEOUT_MS = 2000;

interface GroqRequest {
  systemPrompt: string;
  userMessage: string;
}

interface GroqResponse {
  text: string;
  provider: "groq";
}

/**
 * Call Groq (Llama 3.3 70B) and return the raw text response.
 *
 * @throws Error if the API key is missing, call fails, or times out
 */
export async function callGroq(request: GroqRequest): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userMessage },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    // response_format: json_object tells the model to return valid JSON
    // Same concept as Gemini's responseMimeType: "application/json"
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    // OpenAI-compatible response structure:
    // { choices: [{ message: { content: "..." } }] }
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Groq returned empty response");
    }

    return { text, provider: "groq" };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Groq timed out after ${GROQ_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
