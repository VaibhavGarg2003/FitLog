import { describe, expect, it } from "vitest";
import { MAX_BACKOFF_MS, backoffDelay, parseServerFrame } from "./live-protocol";

describe("parseServerFrame", () => {
  it("accepts the known frames", () => {
    expect(parseServerFrame('{"type":"ready","leaseSeconds":600}')).toEqual({ type: "ready", leaseSeconds: 600 });
    expect(parseServerFrame('{"type":"pong"}')).toEqual({ type: "pong" });
    expect(
      parseServerFrame('{"type":"event","event":{"type":"message.new","conversationId":"c1","messageId":"42"}}')
    ).toEqual({ type: "event", event: { type: "message.new", conversationId: "c1", messageId: "42" } });
    expect(parseServerFrame('{"type":"event","event":{"type":"buddies.changed"}}')).toEqual({
      type: "event",
      event: { type: "buddies.changed" },
    });
  });

  it("ignores anything unexpected", () => {
    for (const bad of [
      "not json",
      "{}",
      '{"type":"event","event":{"type":"message.new","conversationId":"c1","messageId":"x1"}}',
      '{"type":"event","event":{"type":"exec","code":"alert(1)"}}',
      '{"type":"event"}',
      123,
      "x".repeat(5000),
    ]) {
      expect(parseServerFrame(bad)).toBeNull();
    }
  });
});

describe("backoffDelay", () => {
  it("grows with attempts, stays capped and jittered", () => {
    expect(backoffDelay(0, () => 0)).toBe(500);
    expect(backoffDelay(0, () => 1)).toBe(1500);
    expect(backoffDelay(3, () => 1)).toBe(8500);
    expect(backoffDelay(50, () => 1)).toBe(500 + MAX_BACKOFF_MS);
  });
});
