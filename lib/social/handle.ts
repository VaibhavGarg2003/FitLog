/**
 * Buddy handles (@name)
 * ═════════════════════
 *
 * Stored lowercase so uniqueness is case-insensitive without citext; the
 * database CHECK repeats HANDLE_PATTERN. People type "@Rahul_Lifts " — we
 * accept that and store "rahul_lifts".
 */

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}
