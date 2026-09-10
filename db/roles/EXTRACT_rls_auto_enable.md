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

## Read-only dump commands (as `fitlog_migrate` or `postgres`)

Connect with `DIRECT_URL` (`fitlog_migrate`). The `postgres` break-glass credential also
works, but is not needed for any of these reads. Then:

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

### Drift check

Two different things can drift, and a single query cannot catch both.

The fingerprint query lives in [`check_rls_auto_enable.sql`](check_rls_auto_enable.sql).
It prints one line covering **every security-relevant attribute**, not just the body:
function source (`md5` + length), owner, `SECURITY DEFINER`, pinned `search_path`, and
the trigger's event, target function, tags, enabled state and owner.

Expected — the state recorded when `000` was written:

```
99be20677b456ea8d3be47bdd44fb369|953|postgres|t|{search_path=pg_catalog}|ddl_command_end|public.rls_auto_enable()|{"CREATE TABLE","CREATE TABLE AS","SELECT INTO"}|O|postgres
```

No output at all means the function does not exist. Empty fields after the 5th mean the
trigger is missing.

**A — has production changed?**

```bash
psql "$DIRECT_URL" -X -t -A -F '|' -f db/roles/check_rls_auto_enable.sql
```

**B — has the file in the repo changed?** Check A says nothing about `000` itself:
someone could edit the body there and forget to update the recorded line. Install the
file into a throwaway database and run the same query against it:

```bash
docker run -d --name rls-check -e POSTGRES_PASSWORD=postgres postgres:17
docker exec rls-check pg_isready -U postgres     # repeat until "accepting connections"
docker exec -i rls-check psql -U postgres -q -v ON_ERROR_STOP=1 -f - < db/roles/000_rls_auto_enable.sql
docker exec -i rls-check psql -U postgres -X -t -A -F '|' -f - < db/roles/check_rls_auto_enable.sql
docker rm -f rls-check
```

**Reading the results**

| A matches | B matches | Meaning | Action |
|---|---|---|---|
| ✅ | ✅ | Production, the recorded line and `000` all agree | Nothing |
| ❌ | ✅ | Production changed | Re-extract with `pg_get_functiondef`, replace the body in `000` wholesale, update the expected line |
| ✅ | ❌ | `000` was edited | Revert the edit — never hand-edit the body |
| ❌ | ❌ | Both drifted | Treat production as the source of truth and re-extract |

> ⚠️ **Don't diff text dumps on Windows.** `psql.exe` writes CRLF line endings when its
> output is redirected to a file, so a dump taken on Windows differs on every line from
> one taken on Linux even when the function is identical. This exact trap produced a
> false "DIFFERS" while `000` was first being verified. Comparing catalog values and
> server-side hashes avoids client line-ending translation entirely.
