/**
 * fetch wrapper for the buddy + chat API
 * ══════════════════════════════════════
 *
 * Every call carries the expected-user header (lib/utils/expected-user.ts):
 * if this tab is still running as an account that has since been swapped in
 * another tab, the server answers 401 instead of acting as the new account.
 * Errors carry the HTTP status so callers can tell "slow down" (429) and
 * "not allowed any more" (409) apart from a network failure.
 */

import { EXPECTED_USER_HEADER } from "@/lib/utils/expected-user";

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export async function chatFetch<T>(
  userId: string,
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        [EXPECTED_USER_HEADER]: userId,
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    // Network failure, or the caller's AbortSignal (timeout) fired.
    throw new ChatApiError("You're offline. Check your connection.", 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch (error) {
    // A stalled body hitting the caller's timeout is a network failure, not
    // "empty body" — surface it so callers back off instead of using null.
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ChatApiError("You're offline. Check your connection.", 0);
    }
    // otherwise: empty or non-JSON body
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? "Something went wrong. Please try again.";
    throw new ChatApiError(message, res.status);
  }
  return data as T;
}
