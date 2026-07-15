/**
 * reset-user.ts — Delete a user for re-testing (DEV TOOLING)
 * ══════════════════════════════════════════════════════════
 *
 * FitLog stores a person in TWO places that are NOT linked by a foreign key:
 *   1. auth.users        — Supabase Auth identity (email, Google, password)
 *   2. public.users +    — Prisma app data. Every user-owned table has
 *      app tables          onDelete: Cascade, so deleting the ONE public.users
 *                          row wipes profile, workouts, sets, meals, weights,
 *                          steps, goals, templates and insights automatically.
 *                          (Seed tables foods/exercises are untouched.)
 *
 * Deleting one store does NOT delete the other, so:
 *   • data-only reset  → delete public.users  (login kept; next login → /onboarding)
 *   • full nuke (--full) → also delete auth.users (account gone; next login = new user)
 *
 * USAGE (run via the npm scripts so the right env file is loaded):
 *   npm run reset-user      -- you@gmail.com            # DEV, data-only
 *   npm run reset-user      -- you@gmail.com --full     # DEV, full nuke
 *   npm run reset-user:prod -- you@gmail.com --full     # PROD (re-type email to confirm)
 *
 * MANUAL EQUIVALENT (Supabase Dashboard — pick the correct project first!):
 *   • Auth identity:  Authentication → Users → find email → ⋯ → Delete user
 *   • App data (+id): SQL Editor →
 *       delete from public.users where lower(email) = lower('you@gmail.com'); -- cascades app data
 *       delete from auth.users   where lower(email) = lower('you@gmail.com'); -- optional: the login
 *   These two statements are exactly what this script runs.
 */

import { Client } from "pg";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const email = args.find((a) => !a.startsWith("--"));
  const isFull = flags.has("--full");
  const isProd = flags.has("--prod");

  if (!email || !email.includes("@")) {
    console.error(
      "Usage: npm run reset-user -- <email> [--full]\n" +
        "       npm run reset-user:prod -- <email> [--full]"
    );
    process.exit(1);
  }

  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error(
      "No DIRECT_URL / DATABASE_URL in the environment. Run via the npm scripts " +
        "(they load .env.local / .env.prod.local via dotenv)."
    );
    process.exit(1);
  }

  // Show WHICH database we're about to touch (never print the password).
  const parsed = new URL(connStr);
  const dbHost = parsed.hostname;
  const dbName = parsed.pathname.slice(1);
  const envLabel = isProd ? "🔴 PRODUCTION" : "🟢 dev";
  const mode = isFull ? "FULL NUKE (app data + auth identity)" : "data-only (app data; login kept)";

  console.log(`\nTarget:  ${envLabel}`);
  console.log(`DB:      ${dbHost} / ${dbName}`);
  console.log(`Email:   ${email}`);
  console.log(`Mode:    ${mode}\n`);

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    // 1. What exists?
    const pub = await client.query<{ id: string; email: string; name: string | null }>(
      "select id, email, name from public.users where lower(email) = lower($1)",
      [email]
    );
    const auth = await client.query<{ id: string; email: string }>(
      "select id, email from auth.users where lower(email) = lower($1)",
      [email]
    );

    if (pub.rows.length === 0 && auth.rows.length === 0) {
      console.log("Nothing to delete — no matching row in public.users or auth.users.");
      return;
    }

    console.log(`Found: public.users=${pub.rows.length}, auth.users=${auth.rows.length}`);

    // 2. Show the app data that will cascade away.
    const uid = pub.rows[0]?.id;
    if (uid) {
      const counts = await client.query(
        `select
           (select count(*) from workout_sessions  where user_id = $1) as workouts,
           (select count(*) from meal_entries       where user_id = $1) as meals,
           (select count(*) from weight_logs        where user_id = $1) as weights,
           (select count(*) from workout_templates  where user_id = $1) as templates,
           (select count(*) from weekly_insights    where user_id = $1) as insights`,
        [uid]
      );
      const c = counts.rows[0];
      console.log(
        `Cascades: ${c.workouts} workouts, ${c.meals} meals, ${c.weights} weight logs, ` +
          `${c.templates} templates, ${c.insights} insights (+ profile & child rows).`
      );
    }

    if (!isFull && auth.rows.length > 0) {
      console.log("\nNote: auth identity is KEPT (data-only). Next login → /onboarding.");
    }

    // 3. Production guard — require the email to be re-typed.
    if (isProd) {
      const rl = readline.createInterface({ input, output });
      const typed = await rl.question(
        `\n⚠️  This deletes from PRODUCTION. Re-type the email to confirm: `
      );
      rl.close();
      if (typed.trim().toLowerCase() !== email.toLowerCase()) {
        console.log("Confirmation did not match — aborted. Nothing was deleted.");
        return;
      }
    }

    // 4. Delete (single transaction). public.users cascades app data;
    //    auth.users cascades auth.identities/sessions/refresh_tokens.
    await client.query("BEGIN");
    const delPub = await client.query(
      "delete from public.users where lower(email) = lower($1)",
      [email]
    );
    let delAuthCount = 0;
    if (isFull) {
      const delAuth = await client.query(
        "delete from auth.users where lower(email) = lower($1)",
        [email]
      );
      delAuthCount = delAuth.rowCount ?? 0;
    }
    await client.query("COMMIT");

    console.log(
      `\n✅ Done. Removed ${delPub.rowCount ?? 0} public.users row` +
        (isFull ? ` and ${delAuthCount} auth.users row.` : ` (auth identity kept).`)
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n❌ Failed — rolled back, nothing deleted.");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
