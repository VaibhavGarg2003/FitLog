import { describe, expect, it } from "vitest";
import { EXPECTED_USER_HEADER, isExpectedUserMismatch } from "./expected-user";

describe("isExpectedUserMismatch", () => {
  it("ignores requests that don't name an expected user", () => {
    expect(isExpectedUserMismatch(new Headers(), "user-b")).toBe(false);
  });

  it("accepts a matching user", () => {
    const headers = new Headers({ [EXPECTED_USER_HEADER]: "user-a" });
    expect(isExpectedUserMismatch(headers, "user-a")).toBe(false);
  });

  it("flags a queue from user A arriving under user B's cookies", () => {
    const headers = new Headers({ [EXPECTED_USER_HEADER]: "user-a" });
    expect(isExpectedUserMismatch(headers, "user-b")).toBe(true);
  });
});
