/**
 * OpenRouter attribution header — must always name OUR domain.
 *
 * It used to be hardcoded to fitlog.vercel.app, which belongs to a different
 * Vercel account. These tests pin the replacement.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenRouter, openRouterReferer } from "./openrouter";

describe("openRouterReferer", () => {
  it("uses the project's production domain on Vercel", () => {
    expect(
      openRouterReferer({
        VERCEL_PROJECT_PRODUCTION_URL: "myfitlog.vaibhav03.codes",
        VERCEL_URL: "fit-log-abc123.vercel.app",
      })
    ).toBe("https://myfitlog.vaibhav03.codes");
  });

  it("falls back to the deployment host when system env vars are limited", () => {
    expect(
      openRouterReferer({ VERCEL_URL: "fit-log-abc123.vercel.app" })
    ).toBe("https://fit-log-abc123.vercel.app");
  });

  it("ignores blank values", () => {
    expect(
      openRouterReferer({
        VERCEL_PROJECT_PRODUCTION_URL: "  ",
        VERCEL_URL: "fit-log-abc123.vercel.app",
      })
    ).toBe("https://fit-log-abc123.vercel.app");
  });

  it("uses localhost in local development", () => {
    expect(openRouterReferer({})).toBe("http://localhost:3000");
  });

  it("never names the old domain we don't own", () => {
    for (const env of [
      {},
      { VERCEL_URL: "x.vercel.app" },
      { VERCEL_PROJECT_PRODUCTION_URL: "myfitlog-app.vercel.app" },
    ]) {
      expect(openRouterReferer(env)).not.toContain("fitlog.vercel.app");
    }
  });
});

describe("callOpenRouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the computed referer on the real request", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "myfitlog.vaibhav03.codes");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callOpenRouter({ systemPrompt: "s", userMessage: "u" })
    ).resolves.toEqual({ text: "ok", provider: "openrouter" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["HTTP-Referer"]).toBe(
      "https://myfitlog.vaibhav03.codes"
    );
  });
});
