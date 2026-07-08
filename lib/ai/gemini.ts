/**
 * Gemini AI Provider — Primary LLM
 * ═════════════════════════════════
 *
 * Uses the Gemini REST API directly (no SDK — keeps bundle tiny).
 *
 * MODEL: gemini-3.1-flash-lite
 * ─────
 * Free tier: 15 RPM / 250K TPM / 500 RPD
 * Multimodal: supports text + image inputs
 * Best at: Indian food recognition, structured JSON output
 *
 * WHY NO SDK?
 * ──────────
 * The @google/generative-ai npm package adds ~40KB to the server bundle.
 * The REST API does the same thing with a single fetch() call.
 * Since we only need text-in → JSON-out, raw fetch is simpler.
 */

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TIMEOUT_MS = 8000; // 8 seconds max wait

interface GeminiRequest {
  systemPrompt: string;
  userMessage: string;
  /** Optional: base64-encoded image for multimodal requests */
  imageBase64?: string;
  /** Optional: MIME type for the image (default: image/jpeg) */
  imageMimeType?: string;
}

interface GeminiResponse {
  text: string;
  provider: "gemini";
}

/**
 * Call Gemini 3.1 Flash Lite and return the raw text response.
 *
 * @throws Error if the API call fails, times out, or returns no content
 */
export async function callGemini(request: GeminiRequest): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Build the content parts array
  // The Gemini API uses a "parts" array inside "contents"
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Add image first if present (Gemini processes images before text)
  if (request.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: request.imageMimeType || "image/jpeg",
        data: request.imageBase64,
      },
    });
  }

  // Add the user's text message
  parts.push({ text: request.userMessage });

  // Build the request body
  const body = {
    // System instruction — tells the model HOW to behave
    systemInstruction: {
      parts: [{ text: request.systemPrompt }],
    },
    // Contents — the actual user message(s)
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    // Generation config — controls output format
    generationConfig: {
      temperature: 0.2, // Low temperature = more deterministic/precise
      // We want consistent JSON, not creative writing
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      // responseMimeType: "application/json" tells Gemini to return
      // valid JSON directly — no markdown code blocks, no extra text
    },
  };

  // AbortController with timeout — prevents hanging if Gemini is slow
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    // Extract text from Gemini's response structure
    // Structure: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned empty response");
    }

    return { text, provider: "gemini" };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini timed out after ${GEMINI_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
