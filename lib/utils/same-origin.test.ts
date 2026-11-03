import { describe, expect, it } from "vitest";
import { isCrossSiteRequest } from "./same-origin";

const URL_ = "https://myfitlog.example/api/chat/conversations";

function headers(h: Record<string, string>) {
  return new Headers(h);
}

describe("isCrossSiteRequest", () => {
  it("allows same-origin and user-initiated requests", () => {
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "same-origin" }), URL_)).toBe(false);
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "none" }), URL_)).toBe(false);
  });

  it("rejects cross-site and same-site (sibling subdomain) requests", () => {
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "cross-site" }), URL_)).toBe(true);
    expect(isCrossSiteRequest(headers({ "sec-fetch-site": "same-site" }), URL_)).toBe(true);
  });

  it("falls back to Origin when Fetch Metadata is missing", () => {
    expect(isCrossSiteRequest(headers({ origin: "https://myfitlog.example" }), URL_)).toBe(false);
    expect(isCrossSiteRequest(headers({ origin: "https://evil.example" }), URL_)).toBe(true);
    expect(isCrossSiteRequest(headers({ origin: "null" }), URL_)).toBe(true);
  });

  it("lets non-browser requests through (no cookies to ride)", () => {
    expect(isCrossSiteRequest(headers({}), URL_)).toBe(false);
  });
});
