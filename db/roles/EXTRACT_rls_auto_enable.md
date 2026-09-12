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
\sf public.rls_auto_enable()
```

The empty `()` names the exact signature, so this cannot fail as ambiguous if an overload
of the same name is ever added.

Or equivalent catalog dump:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'rls_auto_enable'
  AND p.pronargs = 0;   -- the zero-argument signature the trigger calls
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
  AND p.proname = 'rls_auto_enable'
  AND p.pronargs = 0;   -- the zero-argument signature the trigger calls
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

No output at all means the function does not exist.

**Which field is which** — this decides what to do when something does not match:

| # | Field | Part |
|---|---|---|
| 1 | body `md5` | function |
| 2 | body length | function |
| 3 | owner | function |
| 4 | `SECURITY DEFINER` | function |
| 5 | settings (`search_path`) | function |
| 6 | event | trigger |
| 7 | target function | trigger |
| 8 | tags | trigger |
| 9 | enabled — `O` on, `D` off | trigger |
| 10 | owner | trigger |

Empty fields 6–10 mean the trigger is missing.

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

Fix the repo first, then production. Otherwise you compare production against an edited file.

| Result | What differs | What it means | Action |
|---|---|---|---|
| A ✅ B ✅ | nothing | Production, the recorded line and `000` agree | Nothing |
| B ❌ | anything | `000` was edited | Revert the edit — never hand-edit the body — and re-run B before looking at A |
| A ❌ | **only fields 6–10** (trigger) | Production's safety net is **broken**: disabled, mis-wired or missing | **Repair it** — run `000` against production (below). **Never** update the expected line |
| A ❌ | fields 1–5 (function), and the change was **intended and reviewed** | A legitimate update to the function | Re-extract with `pg_get_functiondef`, replace the body in `000` wholesale, update the expected line |
| A ❌ | fields 1–5 (function), and **nobody intended it** | An accidental change, or tampering | **Restore it** — run `000` against production (below) |

**Repairing production** needs the `postgres` credential, because event-trigger DDL is not
available to `fitlog_migrate`:

```bash
psql "$SUPERUSER_DIRECT_URL" -f db/roles/000_rls_auto_enable.sql
psql "$DIRECT_URL" -X -t -A -F '|' -f db/roles/check_rls_auto_enable.sql   # must now match
```

`000` puts back the committed function — body, owner, `SECURITY DEFINER`, `search_path` —
and rebuilds a disabled or mis-wired trigger. If A still does not match afterwards, stop:
confirm `000` ran without errors, then look at exactly which fields still differ.

> **Why "production is the source of truth" is not the rule.** The expected line exists
> precisely to catch production changing without anyone meaning it to. Adopting
> production's state whenever it differs would turn every accidental or malicious change
> — a switched-off safety net included — into the new baseline, and every later check
> would pass.

> ⚠️ **Don't diff text dumps on Windows.** `psql.exe` writes CRLF line endings when its
> output is redirected to a file, so a dump taken on Windows differs on every line from
> one taken on Linux even when the function is identical. This exact trap produced a
> false "DIFFERS" while `000` was first being verified. Comparing catalog values and
> server-side hashes avoids client line-ending translation entirely.
>
> The same translation can corrupt what you INSTALL, not just what you read. A carriage
> return inside a dollar-quoted function body becomes part of the stored source, so on a
> Windows checkout with `core.autocrlf=true`, running `000` would install a function
> whose `md5(prosrc)` differs from production — and "repairing" production from such a
> checkout would rewrite it with CRs. `.gitattributes` pins `*.sql` to `eol=lf` to stop
> that. If field 1 or 2 differs straight after a clean install of `000`, check for CRs
> first: `tr -cd '\r' < db/roles/000_rls_auto_enable.sql | wc -c` must print 0.
