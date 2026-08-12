# Database roles — least privilege

## Why this exists

The Next.js app and Prisma migrations both connect to production as `postgres`,
which **owns the database**. The same database also holds 11 tables owned by the
separate Django service (`auth_*`, `django_*`, `share_links`) — tables that appear
nowhere in `prisma/schema.prisma`.

Prisma treats anything not in `schema.prisma` as *drift*. One command
(`prisma migrate dev`, `prisma db push`, `prisma migrate reset`) pointed at
production can run `DROP SCHEMA public CASCADE` and destroy all of it. Nothing in
this repo warns you those tables are there.

**The fix makes it impossible rather than forbidden**, by splitting one all-powerful
credential into three identities with different powers.

| Role | Used by | Can do | Cannot do |
|---|---|---|---|
| `postgres` | Django service; break-glass | Everything | — |
| `fitlog_migrate` | `DIRECT_URL` (Prisma migrations) | DDL on Prisma's 16 tables + 15 enums | Drop schema `public`; touch any Django table; break a cross-service FK |
| `fitlog_app` | `DATABASE_URL` (Vercel runtime) | `SELECT/INSERT/UPDATE` on Prisma tables, `DELETE` on all but `users` | Any DDL; any ownership; read Django tables; delete users |

## Why this actually works

`postgres` on Supabase has `rolsuper = false`. A non-superuser **cannot drop an
object it does not own** — Postgres enforces it, not policy. Schema `public` stays
owned by `pg_database_owner`, so `fitlog_migrate` cannot drop the schema either.

Ownership alone is **not** enough, though — see the guard below.

## The cross-service FK guard

`share_links.owner_user_id` (Django) references `users(id)` (Prisma). Because
`fitlog_migrate` owns `users`, it can damage Django's table *indirectly*:
`DROP ... CASCADE` removes dependent constraints **without checking ownership of the
dependent table**. Demonstrated on dev before the guard existed:

```
DROP TABLE public.users CASCADE   →  succeeded
share_links FKs remaining         →  0     (Django's constraint destroyed)
share_links rows                  →  4     (rows survived, integrity did not)
```

A first guard enumerated forbidden commands and matched only "a dropped *table* named
users". `ALTER TABLE public.users DROP CONSTRAINT users_pkey CASCADE` walked straight
past it, because the dropped object was a *constraint*. **Enumerating attacks is
whack-a-mole.** The guard now asserts an invariant instead.

`private.cross_service_fk` is a registry of cross-service foreign keys, auto-populated
at install from `child.relowner <> parent.relowner`. Two event triggers
(`sql_drop` + `ddl_command_end`) call `private.cross_service_fk_drift()`, which checks
**both directions**:

- **missing** — a registered FK no longer exists in the catalog
- **unregistered** — a cross-owner FK exists that nobody registered

Any drift, and the statement is refused. `postgres` is exempt (break-glass).

Direction B matters because a "recompute cross-owner FKs live" design cannot work at
all: once the FK is dropped, the live query simply stops seeing it and has nothing to
compare against. The registry gives the guard a durable expectation.

### Verified blocked (as `fitlog_migrate`, all rolled back)

| Attempt | Result |
|---|---|
| `DROP TABLE users CASCADE` | blocked |
| `ALTER TABLE users DROP CONSTRAINT users_pkey CASCADE` | blocked |
| `ALTER TABLE users DROP COLUMN id CASCADE` | blocked |
| `DROP TABLE share_links CASCADE` | blocked |
| `DROP SCHEMA public CASCADE` | blocked |
| `ALTER TABLE share_links RENAME CONSTRAINT …` | blocked |
| `DELETE FROM private.cross_service_fk` | blocked |
| Drop/disable either event trigger, drop the guard function, drop or insert into the registry, disable `ensure_rls` | all blocked |

### Verified still working

`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `DROP` its own tables — normal migrations are
unaffected.

### Adding a new cross-service FK later

The guard **refuses** an unregistered one. Onboard it as `postgres`, with the constraint
and the registry row **in one transaction** (verified end-to-end on dev):

```sql
BEGIN;
ALTER TABLE public.<child> ADD CONSTRAINT <name>
  FOREIGN KEY (<col>) REFERENCES public.<parent>(<col>) ON DELETE CASCADE;
INSERT INTO private.cross_service_fk (child_table, conname, parent_table, note)
VALUES ('public.<child>'::regclass, '<name>', 'public.<parent>'::regclass, 'why');
COMMIT;
```

Only `postgres` can write to the registry — the other roles have `SELECT` at most.

### Pre-deploy drift check

Wire this into CI; **any rows returned means fail**:

```sql
SELECT * FROM private.cross_service_fk_drift();
```

## Files

| File | Purpose |
|---|---|
| `001_least_privilege_roles.sql` | Creates roles, transfers ownership, sets grants |
| `001_least_privilege_roles_rollback.sql` | Reverses everything |

These are **not** Prisma migrations and must never be moved into
`prisma/migrations/`. They create roles (a cluster-level operation) and must run as
`postgres`, whereas Prisma migrations will run as `fitlog_migrate`.

---

## Running it

> Uses **two transactions** on purpose. Role membership is not visible to privilege
> checks inside the transaction that created it. Do not merge them.

**1. Generate and save passwords first** (they are never written to git):

```bash
openssl rand -hex 32   # → fitlog_migrate password
openssl rand -hex 32   # → fitlog_app password
```

> Use `-hex`, **not** `-base64`. Base64 output contains `/`, `+` and `=`, which are
> reserved characters in a connection URI and must be percent-encoded. Paste one into
> `DATABASE_URL` unchanged and the app fails to connect — a confusing outage caused
> purely by the password alphabet. Hex is `[0-9a-f]` only, so it is always URI-safe.

**2. Apply** — direct connection, port 5432, **not** the pooler:

```bash
psql "$SUPERUSER_DIRECT_URL" \
  -v migrate_password='...' \
  -v app_password='...' \
  -f db/roles/001_least_privilege_roles.sql
```

**3. Switch the application over.** Until this step the roles exist but nothing uses
them — the change is inert and safe.

> **Cutover order matters** (reviewed and approved):
> 1. Apply the SQL **while production still runs as `postgres`** — nothing breaks yet.
> 2. Deploy the [auth.repository.ts](../../lib/repositories/auth.repository.ts) change
>    **and** the `fitlog_app` credentials in **one** Vercel deployment. Splitting them
>    breaks things in both directions: old code + new function = fine, but new code
>    without the function, or old code with `fitlog_app`, both give 500s.
> 3. Immediately run the drift check and smoke-test the app.
>
> Also switch `DIRECT_URL` wherever **migrations** actually run — that may be CI or a
> local `.env.prod.local`, not Vercel.

> ⚠ **The username format depends on which host the URL uses.** Getting this wrong
> produces an authentication failure that looks like a wrong password.
>
> | Host in the URL | Username format |
> |---|---|
> | `db.<ref>.supabase.co` (direct) | plain — `fitlog_migrate` |
> | `*.pooler.supabase.com` (Supavisor) | suffixed — `fitlog_app.<ref>` |
>
> The `.<ref>` suffix is **pooler-only**: it is how Supavisor decides which project to
> route the connection to. Direct connections already encode the project in the
> hostname, so they take a bare role name.

This project's production URLs use **different hosts for the two variables** — check
each one rather than assuming:

| Variable | Host | New username | Port |
|---|---|---|---|
| `DATABASE_URL` (app) | `aws-1-ap-southeast-2.pooler.supabase.com` | `fitlog_app.<ref>` | 6543 |
| `DIRECT_URL` (migrations) | `db.<ref>.supabase.co` | `fitlog_migrate` | 5432 |

Set both in Vercel **and** in the local `.env.prod.local`. Change only the username and
password — keep the host, port, and any query string exactly as they are.

**4. Redeploy** and confirm the app loads data.

**5. Remove the `postgres` credential** from every developer `.env` file. It stays in
your secret manager as break-glass only. This step is what closes the loop — the
roles do nothing if the old all-powerful credential is still lying around in
`.env.prod.local`.

---

## Verifying it worked

The script prints seven checks. Expected results:

| Check | Expected |
|---|---|
| Ownership split | `postgres = 11`, `fitlog_migrate = 16` |
| Owner of schema `public` | `pg_database_owner` |
| `fitlog_migrate` DELETE on Django tables | `false` for all 11 |
| `fitlog_app` CREATE in schema | `false` |
| `fitlog_app` SELECT on `users` | `true` |
| `fitlog_app` DELETE on `users` | **`false`** |
| `fitlog_app` DELETE on `custom_foods` | `true` |
| `fitlog_app` `rolbypassrls` | `true` |
| `postgres` inherits `fitlog_migrate` | `true` |
| `private.cross_service_fk_drift()` | **0 rows** |
| `anon`/`authenticated` EXECUTE on anything in `private` | `false` |

### Why `fitlog_app` cannot delete users

`share_links.owner_user_id` is `ON DELETE CASCADE`, so `DELETE FROM public.users`
removes Django's rows — verified: 4 before, **0 after**, with no DELETE grant on
`share_links`. Event triggers cannot help; they do not fire on DML.

The app never deletes users (it deletes custom foods, meal foods, meal entries, exercise
sets, sessions and templates), so the runtime role does not need the privilege. Removing
it means a leaked runtime credential cannot wipe share links this way.

This is the FK's designed cascade behaviour, not a flaw introduced here — it behaves
identically today under `postgres`. If you add account deletion later, give it a
dedicated privileged path rather than restoring broad `DELETE` to `fitlog_app`.

### Proving the protection is real

This was run against the dev project and **all four operations were blocked**:

```sql
SET LOCAL ROLE fitlog_migrate;
DROP TABLE public.share_links CASCADE;      -- ERROR: must be owner
DROP TABLE public.django_migrations CASCADE;-- ERROR: must be owner
DROP SCHEMA public CASCADE;                 -- ERROR: must be owner
DELETE FROM public.share_links;             -- ERROR: permission denied
```

Run it inside a transaction you roll back, never plain.

---

## Two things that would have broken silently

**1. The RLS event trigger.** `public.rls_auto_enable()` is `SECURITY DEFINER` owned
by `postgres`, fired by the `ensure_rls` event trigger on every `CREATE TABLE`. It
runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, which requires ownership. Once
`fitlog_migrate` owns new tables, `postgres` is no longer the owner — and the
function swallows errors (`EXCEPTION WHEN OTHERS THEN RAISE LOG`). New tables would
have stopped getting RLS **with no visible sign**.

Fixed by `GRANT fitlog_migrate TO postgres`, restoring the ownership check.
Verified: a table created by `fitlog_migrate` still comes out with
`relrowsecurity = true`.

**2. `fitlog_app` and RLS.** Every table has RLS enabled with **zero policies**
(migration `20260712010000_enable_rls_lockdown`). A normal role reads 0 rows from
every table — instant, total outage that looks like data loss. `fitlog_app` is
created `BYPASSRLS` for this reason. Authorization lives in server code; RLS exists
to keep the PostgREST API closed.

> If you ever recreate `fitlog_app`, **`BYPASSRLS` is mandatory.** `postgres` can
> grant it only because it has `rolbypassrls = true` itself.

---

## Tracing this manually

**In the repo** — everything added lives in `db/roles/`, nothing else was modified:

```bash
git log --oneline -- db/roles/
git show <commit> -- db/roles/
```

**In the database** — who owns what:

```sql
SELECT tablename, tableowner FROM pg_tables
WHERE schemaname = 'public' ORDER BY tableowner, tablename;
```

What a role may do to a specific table:

```sql
SELECT has_table_privilege('fitlog_app', 'public.users', 'SELECT'),
       has_table_privilege('fitlog_migrate', 'public.share_links', 'DELETE');
```

Role attributes (`rolbypassrls` is the one that matters):

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
FROM pg_roles WHERE rolname LIKE 'fitlog%' OR rolname = 'postgres';
```

Role memberships, including the Supabase quirk with two rows per membership:

```sql
SELECT roleid::regrole AS role, member::regrole AS member,
       admin_option, inherit_option, set_option, grantor::regrole
FROM pg_auth_members WHERE roleid::regrole::text LIKE 'fitlog%';
```

Which role a live connection is using:

```sql
SELECT usename, count(*) FROM pg_stat_activity GROUP BY 1;
```

Grants on a table:

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'users';
```

---

## Rolling back

```bash
# 1. Point DATABASE_URL / DIRECT_URL back at postgres and redeploy FIRST
# 2. Then:
psql "$SUPERUSER_DIRECT_URL" -f db/roles/001_least_privilege_roles_rollback.sql
```

Dropping a role while something is still connecting as it kills that connection.
Always switch the app back before rolling back the database.

---

## The `auth.users` problem, and why step 7 looks the way it does

[`lib/repositories/auth.repository.ts`](../../lib/repositories/auth.repository.ts)
(`userHasPassword`) used to query `auth.users` through the **runtime** Prisma client.
It is called by both `/api/auth/identities` and `/api/auth/password`, so without a fix
**both endpoints 500 straight after cutover.**

### Why the obvious fix is impossible

Granting `fitlog_app` access to `auth.users` **cannot be done by `postgres`.** The
schema ACL is:

```
supabase_admin=UC/supabase_admin ... postgres=U/supabase_admin
```

`postgres` has `USAGE` but **without grant option**, so
`GRANT USAGE ON SCHEMA auth TO fitlog_app` silently does nothing — PostgreSQL emits a
*warning*, not an error, which is why it looks like it worked. A column grant on
`auth.users` does land (`postgres` holds `SELECT WITH GRANT OPTION` on the table), but
it is unreachable without schema `USAGE`, so it is useless alone. Only `supabase_admin`
could grant it, and that role is platform-reserved.

### What step 7 does instead

A `SECURITY DEFINER` function owned by `postgres` — which *can* read `auth`. The app
executes the function; it never touches the `auth` schema itself.

**The function lives in a `private` schema, not `public`, and that matters.** Supabase
applies default privileges that auto-grant `EXECUTE` on new `public` functions to
`anon` and `authenticated`. Verified on dev: a `REVOKE EXECUTE ... FROM PUBLIC` was
**not** enough — `anon` could still execute it. In `public`, this would have been a
**user-enumeration oracle** at `/rest/v1/rpc/user_has_password`: anyone holding the
anon key could probe whether any user id has a password. PostgREST only exposes
`public`, so `private` is unreachable over the API.

### Verified on dev

| Check | Result |
|---|---|
| Function returns `true` for a user with a password | ✅ |
| Function returns `false` (not `null`) for an unknown id | ✅ |
| `fitlog_app` has `USAGE` on schema `auth` | ❌ false — correct |
| `anon` can execute the function | ❌ false — correct |
| `authenticated` can execute the function | ❌ false — correct |
| `anon` / `authenticated` have `USAGE` on `private` | ❌ false — correct |
| Exact runtime query `SELECT private.user_has_password($1::uuid)` as `fitlog_app` | ✅ returned `true` |

### The paired code change

[`auth.repository.ts`](../../lib/repositories/auth.repository.ts) now calls the
function instead of reading the table. **The SQL and the code change must ship
together** — old code + new roles = 500s; new code + no function = 500s.

## ⚠ `scripts/reset-user.ts` and `reset-users.ts` need the break-glass credential

That script reads and deletes from **`auth.users`** (lines 119 and 217), and
`fitlog_migrate` has no privileges on the `auth` schema at all — verified:

| Check | Result |
|---|---|
| `has_schema_privilege('fitlog_migrate','auth','USAGE')` | `false` |
| `has_table_privilege('fitlog_migrate','auth.users','DELETE')` | `false` |
| `has_table_privilege('postgres','auth.users','DELETE')` | `true` |

The script resolves its connection as `process.env.DIRECT_URL || process.env.DATABASE_URL`,
so once `DIRECT_URL` points at `fitlog_migrate` it will fail on the `auth.users` query.

**This is the correct outcome, not a regression.** A tool that bulk-deletes production
users should require the elevated credential deliberately, not inherit it silently. Run
it with the `postgres` break-glass connection string explicitly:

```bash
DIRECT_URL="$SUPERUSER_DIRECT_URL" npm run reset-users -- ...
```

Do **not** fix this by granting `fitlog_migrate` access to the `auth` schema — that
would hand routine migrations the power to delete auth identities.

## Deliberately out of scope

**Django keeps using `postgres`.** A dedicated `django_owner` role would require
redeploying the Django service, which lives in a different repository. It is not
needed to solve this problem: once Prisma's identity can no longer touch Django's
tables, the catastrophe is gone. Django's key simply became a *different* key from
Prisma's — which was the entire point.

Worth doing later, alongside moving Django's tables into their own `django` schema.
