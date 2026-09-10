# Extract `rls_auto_enable` / `ensure_rls` from a live database

> **Status: resolved.** The definition was extracted from production and is now
> committed as [`000_rls_auto_enable.sql`](000_rls_auto_enable.sql). This file is
> kept for **drift checks** — re-run the dumps below and compare them with `000`.

## Why this file exists

`db/roles/README.md` and `001_least_privilege_roles.sql` treat
`public.rls_auto_enable()` and the `ensure_rls` event trigger as load-bearing.
For a long time **this repo contained only comments** about them — no
`CREATE FUNCTION`, no `CREATE EVENT TRIGGER` — so a rebuild from the repo would
have produced a database with no auto-RLS.

**Never invent or hand-edit the function.** Always source it from a live
database. A fabricated privileged DDL trigger is worse than a documented gap.

You do **not** need the `postgres` credential for these dumps: `pg_get_functiondef`
and `pg_event_trigger` are readable as `fitlog_migrate`, so `DIRECT_URL` works.

## Read-only dump commands (as `postgres`)

Connect with the break-glass credential (direct, port 5432), then:

### 1. Function source

```psql
\sf public.rls_auto_enable
```

Or equivalent catalog dump:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'rls_auto_enable';
```

Also capture ownership and security attributes:

```sql
SELECT p.proname,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS config,          -- e.g. search_path
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'rls_auto_enable';
```

### 2. Event trigger definition

```sql
SELECT evtname,
       evtevent,
       evtenabled,
       evtfoid::regproc AS function,
       evttags
FROM pg_event_trigger
WHERE evtname = 'ensure_rls'
   OR evtfoid::regproc::text ILIKE '%rls_auto_enable%';
```

To reconstruct `CREATE EVENT TRIGGER` you need at least: event name, event
(`ddl_command_end` etc.), enabled state, tags filter, and the function OID.

### 3. After extraction

Commit the real `CREATE FUNCTION` + `CREATE EVENT TRIGGER` (or a roles SQL
file under `db/roles/`) sourced from production — do not freehand a
`SECURITY DEFINER` DDL trigger.

## Gap status

**Closed.** `000_rls_auto_enable.sql` holds the verbatim production definition.

### Drift check — compare hashes inside the database, not text dumps

```bash
psql "$DIRECT_URL" -X -t -A -c "SELECT length(prosrc), md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable';"
```

Expected — the fingerprint recorded in `000_rls_auto_enable.sql`:

```
953|99be20677b456ea8d3be47bdd44fb369
```

Same values → production and the repo agree. Different → production changed:
re-extract with `pg_get_functiondef` and replace the body in `000` **wholesale**,
then update the fingerprint. Never hand-edit the body.

> ⚠️ **Don't diff text dumps on Windows.** `psql.exe` writes CRLF line endings when
> its output is redirected to a file, so a dump taken on Windows differs on every
> line from one taken on Linux even when the function is identical. This exact trap
> produced a false "DIFFERS" while `000` was being verified. Hashing `prosrc`
> server-side avoids client line-ending translation entirely.
