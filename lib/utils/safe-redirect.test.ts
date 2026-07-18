/**
 * Open-redirect sanitizer tests — each rejected case is a real attack shape.
 */

import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

describe("safeRedirectPath", () => {
  it("passes through normal same-origin paths", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/workout?date=2026-07-13")).toBe(
      "/workout?date=2026-07-13"
    );
  });

  it("falls back when empty or missing", () => {
    expect(safeRedirectPath(null)).toBe("/onboarding");
    expect(safeRedirectPath(undefined)).toBe("/onboarding");
    expect(safeRedirectPath("")).toBe("/onboarding");
  });

  it("rejects protocol-relative escapes (//evil.com)", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/onboarding");
    expect(safeRedirectPath("//evil.com/phish")).toBe("/onboarding");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/onboarding");
    expect(safeRedirectPath("http://evil.com/login")).toBe("/onboarding");
  });

  it("rejects backslash normalization quirks (/\\evil.com)", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/onboarding");
    expect(safeRedirectPath("/\\/evil.com")).toBe("/onboarding");
  });

  it("rejects scheme smuggling anywhere in the value", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/onboarding");
    // Strict by design: even a nested URL inside the query is rejected.
    // No legitimate FitLog redirect target carries "://" — and a nested
    // URL is exactly what a second-hop open redirect looks like.
    expect(safeRedirectPath("/redirect?to=https://evil.com")).toBe(
      "/onboarding"
    );
  });

  it("respects a custom fallback", () => {
    expect(safeRedirectPath("//evil.com", "/login")).toBe("/login");
  });
});
