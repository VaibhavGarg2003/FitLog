/**
 * Account deletion provisioning helpers (no DB).
 *
 * Asserts the env gate: without ACCOUNT_DELETION_DATABASE_URL the client is
 * never constructed and deleteUserAccount surfaces ServiceUnavailableError.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ServiceUnavailableError } from "@/lib/utils/errors";

describe("account deletion provisioning", () => {
  const original = process.env.ACCOUNT_DELETION_DATABASE_URL;

  beforeEach(() => {
    // Ensure module re-evaluates env on each test via dynamic import after env set.
    delete process.env.ACCOUNT_DELETION_DATABASE_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ACCOUNT_DELETION_DATABASE_URL;
    } else {
      process.env.ACCOUNT_DELETION_DATABASE_URL = original;
    }
  });

  it("isAccountDeletionProvisioned is false when env is unset", async () => {
    const { isAccountDeletionProvisioned } = await import(
      "@/lib/repositories/account.repository"
    );
    expect(isAccountDeletionProvisioned()).toBe(false);
  });

  it("isAccountDeletionProvisioned is true when env is set", async () => {
    process.env.ACCOUNT_DELETION_DATABASE_URL =
      "postgresql://fitlog_deleter:x@localhost:5432/postgres";
    // Re-read function (no module cache of the boolean — it reads env each call).
    const { isAccountDeletionProvisioned } = await import(
      "@/lib/repositories/account.repository"
    );
    expect(isAccountDeletionProvisioned()).toBe(true);
  });

  it("deleteUserAccount throws ServiceUnavailableError when env is unset", async () => {
    const { deleteUserAccount } = await import(
      "@/lib/repositories/account.repository"
    );
    await expect(deleteUserAccount("00000000-0000-0000-0000-000000000001")).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
  });
});
