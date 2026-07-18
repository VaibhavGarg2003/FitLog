/**
 * reset-users.ts — Delete MULTIPLE users for re-testing (DEV TOOLING)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Same two-store model as reset-user.ts:
 *   1. auth.users        — Supabase Auth identity
 *   2. public.users +    — Prisma app data (onDelete: Cascade wipes
 *      app tables          profile, workouts, meals, weights, etc.)
 *
 * USAGE (run via the npm scripts so the right env file is loaded):
 *   npm run reset-users      -- a@x.com b@x.com c@x.com            # DEV, data-only
 *   npm run reset-users      -- a@x.com b@x.com --full             # DEV, full nuke
 *   npm run reset-users:prod -- a@x.com b@x.com --full             # PROD
 *
 * Always prompts: type "yes" to confirm before any delete runs.
 */

import { Client } from "pg";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type UserRow = { id: string; email: string; name: string | null };
type AuthRow = { id: string; email: string };

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const emails = argv
    .filter((a) => !a.startsWith("--"))
    .map((e) => e.trim())
    .filter(Boolean);

  // De-dupe case-insensitively while keeping first-seen casing.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const email of emails) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
  }

  return {
    emails: unique,
    isFull: flags.has("--full"),
    isProd: flags.has("--prod"),
  };
}

function isValidEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

async function main() {
  const { emails, isFull, isProd } = parseArgs(process.argv.slice(2));

  if (emails.length === 0) {
    console.error(
      "Usage: npm run reset-users -- <email1> <email2> ... [--full]\n" +
        "       npm run reset-users:prod -- <email1> <email2> ... [--full]"
    );
    process.exit(1);
  }

  const invalid = emails.filter((e) => !isValidEmail(e));
  if (invalid.length > 0) {
    console.error(`Invalid email(s): ${invalid.join(", ")}`);
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

  const parsed = new URL(connStr);
  const dbHost = parsed.hostname;
  const dbName = parsed.pathname.slice(1);
  const envLabel = isProd ? "🔴 PRODUCTION" : "🟢 dev";
  const mode = isFull
    ? "FULL NUKE (app data + auth identity)"
    : "data-only (app data; login kept)";

  console.log(`\nTarget:  ${envLabel}`);
  console.log(`DB:      ${dbHost} / ${dbName}`);
  console.log(`Emails:  ${emails.length} user(s)`);
  console.log(`Mode:    ${mode}\n`);

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    // 1. Look up each email in both stores and print a preview.
    type Found = {
      email: string;
      pub: UserRow | null;
      auth: AuthRow | null;
      cascades?: {
        workouts: string;
        meals: string;
        weights: string;
        templates: string;
        insights: string;
      };
    };

    const found: Found[] = [];
    let anyExists = false;

    for (const email of emails) {
      const pub = await client.query<UserRow>(
        "select id, email, name from public.users where lower(email) = lower($1)",
        [email]
      );
      const auth = await client.query<AuthRow>(
        "select id, email from auth.users where lower(email) = lower($1)",
        [email]
      );

      const row: Found = {
        email,
        pub: pub.rows[0] ?? null,
        auth: auth.rows[0] ?? null,
      };

      if (row.pub || row.auth) anyExists = true;

      if (row.pub) {
        const counts = await client.query(
          `select
             (select count(*) from workout_sessions  where user_id = $1) as workouts,
             (select count(*) from meal_entries       where user_id = $1) as meals,
             (select count(*) from weight_logs        where user_id = $1) as weights,
             (select count(*) from workout_templates  where user_id = $1) as templates,
             (select count(*) from weekly_insights    where user_id = $1) as insights`,
          [row.pub.id]
        );
        row.cascades = counts.rows[0];
      }

      found.push(row);
    }

    console.log("Preview:");
    for (const f of found) {
      if (!f.pub && !f.auth) {
        console.log(`  • ${f.email}  — not found (skip)`);
        continue;
      }
      const pubLabel = f.pub
        ? `public.users yes${f.pub.name ? ` (${f.pub.name})` : ""}`
        : "public.users no";
      const authLabel = f.auth ? "auth.users yes" : "auth.users no";
      let line = `  • ${f.email}  — ${pubLabel}, ${authLabel}`;
      if (f.cascades) {
        const c = f.cascades;
        line +=
          `\n      cascades: ${c.workouts} workouts, ${c.meals} meals, ` +
          `${c.weights} weight logs, ${c.templates} templates, ${c.insights} insights`;
      }
      console.log(line);
    }

    if (!anyExists) {
      console.log("\nNothing to delete — no matching rows for any email.");
      return;
    }

    if (!isFull) {
      const kept = found.filter((f) => f.auth).length;
      if (kept > 0) {
        console.log(
          `\nNote: auth identity KEPT for ${kept} user(s) (data-only). Next login → /onboarding.`
        );
      }
    }

    // 2. Always confirm with "yes" before bulk delete.
    const rl = readline.createInterface({ input, output });
    const prompt = isProd
      ? `\n⚠️  This deletes ${found.filter((f) => f.pub || f.auth).length} user(s) from PRODUCTION. Type "yes" to confirm: `
      : `\nType "yes" to delete the listed user data: `;
    const typed = await rl.question(prompt);
    rl.close();

    if (typed.trim().toLowerCase() !== "yes") {
      console.log('Confirmation was not "yes" — aborted. Nothing was deleted.');
      return;
    }

    // 3. Delete all in one transaction.
    await client.query("BEGIN");

    let totalPub = 0;
    let totalAuth = 0;
    const results: { email: string; pub: number; auth: number }[] = [];

    for (const f of found) {
      if (!f.pub && !f.auth) {
        results.push({ email: f.email, pub: 0, auth: 0 });
        continue;
      }

      const delPub = await client.query(
        "delete from public.users where lower(email) = lower($1)",
        [f.email]
      );
      const pubCount = delPub.rowCount ?? 0;
      totalPub += pubCount;

      let authCount = 0;
      if (isFull) {
        const delAuth = await client.query(
          "delete from auth.users where lower(email) = lower($1)",
          [f.email]
        );
        authCount = delAuth.rowCount ?? 0;
        totalAuth += authCount;
      }

      results.push({ email: f.email, pub: pubCount, auth: authCount });
    }

    await client.query("COMMIT");

    console.log("\n✅ Done.");
    for (const r of results) {
      if (r.pub === 0 && r.auth === 0) {
        console.log(`  • ${r.email}  — skipped (not found)`);
        continue;
      }
      console.log(
        `  • ${r.email}  — removed ${r.pub} public.users` +
          (isFull ? ` and ${r.auth} auth.users` : " (auth kept)")
      );
    }
    console.log(
      `\nTotals: ${totalPub} public.users` +
        (isFull ? `, ${totalAuth} auth.users` : " (auth identities kept)") +
        "."
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
