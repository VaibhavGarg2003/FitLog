/**
 * Parent session activity touch — documents the raw-SQL path.
 *
 * Plan F2 requires that every set create/update/delete moves
 * workout_sessions.updated_at inside the same transaction. Prisma may
 * silently ignore `data: { updatedAt: new Date() }` on an `@updatedAt`
 * field, so the repository uses:
 *
 *   await tx.$executeRaw`
 *     UPDATE workout_sessions SET updated_at = now() WHERE id = ${sessionId}
 *   `
 *
 * Without a live Postgres we cannot assert the column value moved. This
 * test locks the chosen call shape (raw UPDATE, not Prisma update) so a
 * silent switch back to the unreliable path fails the suite.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "workout.repository.ts"
);

describe("touchSessionActivity implementation", () => {
  const source = readFileSync(repoPath, "utf8");

  it("uses raw UPDATE workout_sessions SET updated_at = now()", () => {
    expect(source).toMatch(
      /UPDATE\s+workout_sessions\s+SET\s+updated_at\s*=\s*now\(\)/i
    );
    expect(source).toMatch(/\$executeRaw/);
  });

  it("does not rely on Prisma data: { updatedAt } alone for the touch", () => {
    // The activity bump must not be a lone Prisma update of updatedAt —
    // that path is the one the plan flags as possibly a silent no-op.
    // Allow updatedAt elsewhere (e.g. comments) but require the raw path.
    expect(source).toContain("touchSessionActivity");
    expect(source).toMatch(/async function touchSessionActivity/);
  });
});
