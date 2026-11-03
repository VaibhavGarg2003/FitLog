import { describe, expect, it } from "vitest";
import {
  compareIds,
  mergeMessages,
  newestConfirmedId,
  newestIncomingId,
  oldestConfirmedId,
  type ChatMessage,
  type ServerMessage,
} from "./merge-messages";

const ME = "me";
const THEM = "them";

function server(id: string, sender = THEM, clientMessageId = `c-${id}`): ServerMessage {
  return {
    id,
    conversationId: "conv",
    senderId: sender,
    clientMessageId,
    body: `msg ${id}`,
    createdAt: "2026-10-09T00:00:00Z",
  };
}

function pending(clientMessageId: string, status: "sending" | "failed" = "sending"): ChatMessage {
  return {
    id: null,
    status,
    conversationId: "conv",
    senderId: ME,
    clientMessageId,
    body: "typed",
    createdAt: "2026-10-09T00:00:01Z",
  };
}

describe("mergeMessages", () => {
  it("sorts by numeric id, not string order", () => {
    const merged = mergeMessages([], [server("10"), server("9"), server("100")]);
    expect(merged.map((m) => m.id)).toEqual(["9", "10", "100"]);
  });

  it("de-duplicates overlapping pages", () => {
    const first = mergeMessages([], [server("1"), server("2")]);
    const merged = mergeMessages(first, [server("2"), server("3")]);
    expect(merged.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("replaces a pending bubble with its confirmed copy", () => {
    const withPending = mergeMessages(mergeMessages([], [server("1")]), []);
    const current = [...withPending, pending("abc"), pending("def", "failed")];
    const merged = mergeMessages(current, [server("2", ME, "abc")]);
    expect(merged.map((m) => [m.id, m.status, m.clientMessageId])).toEqual([
      ["1", "sent", "c-1"],
      ["2", "sent", "abc"],
      [null, "failed", "def"],
    ]);
  });

  it("does not drop my pending send because THEY reused a client id", () => {
    const merged = mergeMessages([pending("same")], [server("5", THEM, "same")]);
    expect(merged).toHaveLength(2);
  });

  it("handles ids beyond Number.MAX_SAFE_INTEGER", () => {
    const big = "9007199254740993";
    const bigger = "9007199254740994";
    expect(compareIds(big, bigger)).toBe(-1);
    const merged = mergeMessages([], [server(bigger), server(big)]);
    expect(merged.map((m) => m.id)).toEqual([big, bigger]);
  });
});

describe("cursor helpers", () => {
  const list = mergeMessages([pending("p")], [server("3", ME), server("4"), server("2")]);

  it("finds the newest and oldest confirmed ids", () => {
    expect(newestConfirmedId(list)).toBe("4");
    expect(oldestConfirmedId(list)).toBe("2");
    expect(newestConfirmedId([pending("x")])).toBeNull();
  });

  it("finds the newest message from the other person", () => {
    expect(newestIncomingId(list, ME)).toBe("4");
    expect(newestIncomingId(mergeMessages([], [server("7", ME)]), ME)).toBeNull();
  });
});
