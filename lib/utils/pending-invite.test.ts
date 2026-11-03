import { describe, expect, it } from "vitest";
import { isInvitePath, pendingInvitePath } from "./pending-invite";

const CODE = "AbCdEfGhIjKlMnOpQrSt_-";

describe("pending invite path", () => {
  it("accepts only an exact invite path", () => {
    expect(isInvitePath(`/buddies/invite/${CODE}`)).toBe(true);
    expect(pendingInvitePath(`/buddies/invite/${CODE}`)).toBe(`/buddies/invite/${CODE}`);
  });

  it("never becomes an open redirect", () => {
    for (const bad of [
      undefined,
      "",
      "https://evil.example/buddies/invite/" + CODE,
      "//evil.example",
      "/dashboard",
      `/buddies/invite/${CODE}/../../x`,
      `/buddies/invite/${CODE}?x=1`,
      "/buddies/invite/short",
    ]) {
      expect(pendingInvitePath(bad)).toBeNull();
    }
  });
});
