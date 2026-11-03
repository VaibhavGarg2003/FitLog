import { describe, expect, it } from "vitest";
import type { ServerMessage } from "./merge-messages";
import {
  EMPTY_THREAD,
  applyAfterPage,
  applyNewestPage,
  applyOlderPage,
  applySent,
} from "./thread-sync";

const msg = (id: string, sender = "them"): ServerMessage => ({
  id,
  conversationId: "c",
  senderId: sender,
  clientMessageId: `c-${id}`,
  body: id,
  createdAt: "2026-10-09T00:00:00Z",
});

describe("thread sync cursor", () => {
  it("never skips messages committed before my send but not yet fetched", () => {
    // Loaded up to 100.
    let state = applyNewestPage(EMPTY_THREAD, { messages: [msg("99"), msg("100")], hasMore: false });
    expect(state.syncCursor).toBe("100");

    // They send 101 and 102 (not fetched yet); my send confirms as 103.
    state = applySent(state, msg("103", "me"));
    expect(state.messages.map((m) => m.id)).toEqual(["99", "100", "103"]);
    expect(state.syncCursor).toBe("100"); // ← the fix: still 100

    // Catch-up "after 100" returns 101, 102 and 103 again — all present once.
    state = applyAfterPage(state, [msg("101"), msg("102"), msg("103", "me")]);
    expect(state.messages.map((m) => m.id)).toEqual(["99", "100", "101", "102", "103"]);
    expect(state.syncCursor).toBe("103");
  });

  it("older pages don't move the cursor; empty threads start at 0", () => {
    expect(EMPTY_THREAD.syncCursor).toBe("0");
    let state = applyNewestPage(EMPTY_THREAD, { messages: [msg("50")], hasMore: true });
    state = applyOlderPage(state, { messages: [msg("10"), msg("20")], hasMore: false });
    expect(state.syncCursor).toBe("50");
    expect(state.hasOlder).toBe(false);
    expect(state.messages.map((m) => m.id)).toEqual(["10", "20", "50"]);
  });

  it("a later newest-page refetch never jumps the cursor over a gap", () => {
    // Cached 71–100 (cursor 100); meanwhile 101–150 were sent.
    const ids = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => msg(String(from + i)));
    let state = applyNewestPage(EMPTY_THREAD, { messages: ids(71, 100), hasMore: true });
    expect(state.syncCursor).toBe("100");

    // An invalidation refetches the newest page: 121–150.
    state = applyNewestPage(state, { messages: ids(121, 150), hasMore: true });
    expect(state.syncCursor).toBe("100"); // ← not 150
    expect(state.hasOlder).toBe(true);

    // Catch-up from 100 brings 101–150; nothing missing.
    state = applyAfterPage(state, ids(101, 150));
    const got = state.messages.map((m) => Number(m.id));
    expect(got).toEqual(Array.from({ length: 80 }, (_, i) => 71 + i));
    expect(state.syncCursor).toBe("150");
  });

  it("an empty newest page keeps cursor 0 so catch-up fetches from the start", () => {
    const state = applyNewestPage(EMPTY_THREAD, { messages: [], hasMore: false });
    expect(state.syncCursor).toBe("0");
  });
});
