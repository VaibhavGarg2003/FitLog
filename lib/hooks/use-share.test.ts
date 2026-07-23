/**
 * Share hook tests.
 *
 * `shareUrl` builds the link a user copies/sends. It runs in two worlds —
 * the browser (absolute URL from the current origin) and the server (a
 * relative path, since there's no `window`). Both must be correct: an
 * absolute URL on the server would bake in the wrong host, and a relative
 * path in the browser wouldn't survive a paste into WhatsApp.
 */

import { describe, it, expect, afterEach } from "vitest";
import { shareUrl } from "@/lib/hooks/use-share";

describe("shareUrl", () => {
  const original = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  it("returns a relative path when there is no window (server render)", () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(shareUrl("abc123")).toBe("/s/abc123");
  });

  it("builds an absolute URL from the origin in the browser", () => {
    (globalThis as { window?: unknown }).window = {
      location: { origin: "https://fit.example" },
    };
    expect(shareUrl("abc123")).toBe("https://fit.example/s/abc123");
  });
});
