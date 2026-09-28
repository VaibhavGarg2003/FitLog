/**
 * User Calendar — "today" for a user, decided on the server
 * ══════════════════════════════════════════════════════════
 *
 * Routes normally receive the day from the client (the app's calendar, see
 * components/shared/timezone-provider.tsx). When a request carries no date,
 * the fallback must still be the USER'S day in their saved time zone — never
 * the server's: Vercel runs in UTC, where 00:30 in India is still yesterday.
 *
 * One extra indexed read, and only on the fallback path.
 */

import { getUserTimezone } from "@/lib/repositories/profile.repository";
import { todayForUser } from "@/lib/utils/local-date";

/** "YYYY-MM-DD" today in the user's saved zone (server date if none saved). */
export async function userToday(userId: string): Promise<string> {
  return todayForUser(await getUserTimezone(userId));
}
