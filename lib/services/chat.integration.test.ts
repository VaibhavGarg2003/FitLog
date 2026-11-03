/**
 * Buddies + chat — live Postgres integration
 * ══════════════════════════════════════════
 *
 * Exercises the rules that only a real database can prove: advisory-lock
 * serialisation (send vs block, concurrent duplicate sends), per-conversation
 * id ordering, monotonic read markers, receipt privacy, CHECK constraints and
 * the account-deletion cascade.
 *
 * HOW TO RUN (not part of default CI — skips when env is unset). The role
 * must be able to DELETE from users for cleanup (fitlog_migrate on dev, or
 * postgres on a throwaway container with migrations applied):
 *
 *   TEST_DATABASE_URL=<dev DIRECT_URL> npx vitest run lib/services/chat.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const TEST_URL = process.env.TEST_DATABASE_URL;

type Social = typeof import("./social.service");
type Chat = typeof import("./chat.service");

// A remote dev database is far slower than a local container.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe.skipIf(!TEST_URL)("buddies + chat (integration)", () => {
  let prisma: PrismaClient;
  let social: Social;
  let chat: Chat;

  const run = crypto.randomUUID().slice(0, 6);
  const A = crypto.randomUUID();
  const B = crypto.randomUUID();
  const C = crypto.randomUUID();
  const handleA = `it_a_${run}`;
  const handleB = `it_b_${run}`;
  let conversationId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    vi.resetModules();
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    prisma = (await import("@/lib/supabase/prisma")).prisma;
    social = await import("./social.service");
    chat = await import("./chat.service");

    await prisma.user.createMany({
      data: [A, B, C].map((id, i) => ({
        id,
        email: `chat-it-${run}-${i}@example.com`,
        name: `IT ${i}`,
      })),
    });
  });

  afterAll(async () => {
    await prisma?.userReport.deleteMany({ where: { reporterId: C } });
    await prisma?.user.deleteMany({ where: { id: { in: [A, B, C] } } });
    await prisma?.$disconnect();
  });

  it("requires a handle before taking part", async () => {
    await expect(chat.startConversation(C, A)).rejects.toThrow(/buddy name first/);
    await expect(
      social.sendBuddyRequest(C, { handle: handleA })
    ).rejects.toThrow(/buddy name first/);
  });

  it("claims unique, case-insensitive handles", async () => {
    await social.claimHandle(A, handleA);
    await social.claimHandle(B, handleB);
    await expect(social.claimHandle(C, handleA)).rejects.toThrow(/already taken/);
    const me = await social.getMySocialProfile(A);
    expect(me?.inviteCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("runs the request → accept flow, idempotently", async () => {
    expect((await social.sendBuddyRequest(A, { handle: handleB })).outcome).toBe("REQUESTED");
    expect((await social.sendBuddyRequest(A, { handle: handleB })).outcome).toBe(
      "ALREADY_REQUESTED"
    );
    expect((await social.lookupByHandle(B, handleA)).relationship).toBe("INCOMING");
    await expect(social.respondToBuddyRequest(A, B, "accept")).rejects.toThrow(/no longer pending/);
    expect((await social.respondToBuddyRequest(B, A, "accept")).outcome).toBe("CONNECTED");
    expect((await social.lookupByHandle(A, handleB)).relationship).toBe("BUDDIES");
  });

  it("creates exactly one conversation under concurrent starts", async () => {
    const ids = await Promise.all([
      chat.startConversation(A, B),
      chat.startConversation(B, A),
      chat.startConversation(A, B),
    ]);
    expect(new Set(ids).size).toBe(1);
    conversationId = ids[0];
    const members = await prisma.conversationMember.count({ where: { conversationId } });
    expect(members).toBe(2);
  });

  it("deduplicates concurrent retries of the same send", async () => {
    const clientMessageId = crypto.randomUUID();
    const results = await Promise.all(
      [0, 1, 2].map(() => chat.sendMessage(A, conversationId, { clientMessageId, body: "hi" }))
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.message.id)).size).toBe(1);
    await expect(
      chat.sendMessage(A, conversationId, { clientMessageId, body: "different" })
    ).rejects.toThrow(/different content/);
  });

  it("keeps ids in commit order so after-cursor catch-up is complete", async () => {
    const before = await chat.getMessages(B, conversationId, { limit: 50 });
    const cursor = BigInt(before.messages.at(-1)!.id);

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        chat.sendMessage(i % 2 ? A : B, conversationId, {
          clientMessageId: crypto.randomUUID(),
          body: `burst ${i}`,
        })
      )
    );

    const page = await chat.getMessages(A, conversationId, { after: cursor, limit: 50 });
    expect(page.messages).toHaveLength(6);
    const ids = page.messages.map((m) => BigInt(m.id));
    expect([...ids].sort((x, y) => (x < y ? -1 : 1))).toEqual(ids);
  });

  it("refuses non-members and hides other people's conversations", async () => {
    await expect(chat.getMessages(C, conversationId, { limit: 10 })).rejects.toThrow(/not found/);
    await expect(
      chat.sendMessage(C, conversationId, { clientMessageId: crypto.randomUUID(), body: "x" })
    ).rejects.toThrow(/not found/);
  });

  it("moves read markers forward only, clamped to the newest message", async () => {
    const unreadBefore = await chat.getUnreadTotal(B);
    expect(unreadBefore).toBeGreaterThan(0);

    const huge = await chat.markConversationRead(B, conversationId, BigInt("9223372036854775000"));
    expect(huge.advanced).toBe(true);
    const newest = (await chat.getMessages(B, conversationId, { limit: 1 })).messages[0].id;
    expect(huge.lastReadMessageId).toBe(newest);

    const back = await chat.markConversationRead(B, conversationId, BigInt(1));
    expect(back).toMatchObject({ advanced: false, lastReadMessageId: newest });
    expect(await chat.getUnreadTotal(B)).toBe(0);
  });

  it("shows read receipts only when both people share them", async () => {
    let summary = await chat.getConversation(A, conversationId);
    expect(summary.otherLastReadMessageId).not.toBeNull();

    await social.updateReadReceipts(B, false);
    summary = await chat.getConversation(A, conversationId);
    expect(summary.otherLastReadMessageId).toBeNull();
    // ...and B doesn't see A's either (reciprocal)
    expect((await chat.getConversation(B, conversationId)).otherLastReadMessageId).toBeNull();
    await social.updateReadReceipts(B, true);
  });

  it("serialises a send racing a block: never a message after the block", async () => {
    const results = await Promise.allSettled([
      chat.sendMessage(A, conversationId, { clientMessageId: crypto.randomUUID(), body: "race" }),
      social.blockUser(B, A),
    ]);
    expect(results[1].status).toBe("fulfilled");

    const block = await prisma.userBlock.findUniqueOrThrow({
      where: { blockerId_blockedId: { blockerId: B, blockedId: A } },
    });
    const after = await prisma.message.count({
      where: { conversationId, createdAt: { gt: block.createdAt } },
    });
    expect(after).toBe(0);

    await expect(
      chat.sendMessage(A, conversationId, { clientMessageId: crypto.randomUUID(), body: "x" })
    ).rejects.toThrow(/can't send/);
    await expect(social.lookupByHandle(A, handleB)).rejects.toThrow(/No buddy found/);
    expect((await chat.getConversation(B, conversationId)).canMessage).toBe(false);

    await social.unblockUser(B, A);
    // The block ended the buddyship; unblocking does not restore it.
    expect((await social.lookupByHandle(A, handleB)).relationship).toBe("NONE");
  });

  it("caps reports per day even under concurrency", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => social.reportUser(C, { userId: A, reason: "SPAM" }))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await prisma.userReport.count({ where: { reporterId: C } })).toBe(10);
  });

  it("counts every request sent, even repeats to the same person", async () => {
    // C opts in and asks A, cancels (1-day cooldown) — the ledger keeps both
    // requests distinct even though the pair has a single buddyships row.
    await social.claimHandle(C, `it_c_${run}`);
    await social.sendBuddyRequest(C, { handle: handleA });
    await social.respondToBuddyRequest(C, A, "cancel");
    await expect(social.sendBuddyRequest(C, { handle: handleA })).rejects.toThrow(/right now/);
    expect(await prisma.buddyRequestEvent.count({ where: { requesterId: C } })).toBe(1);
  });

  it("never lets a rotated invite connect anyone", async () => {
    const old = (await social.getMySocialProfile(A))!.inviteCode;
    await social.rotateInviteCode(A);
    // The old code must no longer resolve to anyone.
    await expect(social.sendBuddyRequest(B, { inviteCode: old })).rejects.toThrow(/No buddy found/);
  });

  it("keeps a cooldown across block → unblock", async () => {
    // From the earlier race test: B blocked A, then unblocked — A is now on
    // the block cooldown and must not be able to re-request B.
    await expect(social.sendBuddyRequest(A, { handle: handleB })).rejects.toThrow(/right now/);
    // B (the blocker) can still reach out.
    expect((await social.sendBuddyRequest(B, { handle: handleA })).outcome).toBe("REQUESTED");
  });

  it("retention deletes only messages older than 90 days and keeps read markers", async () => {
    const { runChatRetention } = await import("./chat-retention.service");
    const old = await prisma.message.create({
      data: {
        conversationId,
        senderId: A,
        clientMessageId: crypto.randomUUID(),
        body: "ancient",
        createdAt: new Date(Date.now() - 100 * 24 * 3600 * 1000),
      },
    });
    const markerBefore = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true, lastReadMessageId: true },
    });
    const recentCount = await prisma.message.count({
      where: { conversationId, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });

    const result = await runChatRetention();
    expect(result.deleted.messages).toBeGreaterThanOrEqual(1);
    expect(result.chatBytes).toBeGreaterThan(0);
    expect(await prisma.message.findUnique({ where: { id: old.id } })).toBeNull();
    expect(
      await prisma.message.count({
        where: { conversationId, createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
      })
    ).toBe(recentCount);
    const markerAfter = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true, lastReadMessageId: true },
    });
    expect(markerAfter).toEqual(markerBefore);
  });

  it("enforces the database CHECKs even for raw writes", async () => {
    await expect(
      prisma.$executeRaw`UPDATE social_profiles SET handle = 'Bad Handle' WHERE user_id = ${A}`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`INSERT INTO messages (conversation_id, sender_id, client_message_id, body)
                         VALUES (${conversationId}, ${C}, ${crypto.randomUUID()}, 'not a member')`
    ).rejects.toThrow();
  });

  it("deletes the whole conversation when either account is deleted", async () => {
    await prisma.user.delete({ where: { id: B } });
    expect(await prisma.conversation.count({ where: { id: conversationId } })).toBe(0);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
  });
});
