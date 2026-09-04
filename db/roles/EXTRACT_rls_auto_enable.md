# Extract `rls_auto_enable` / `ensure_rls` from a live database

## Why this file exists

`db/roles/README.md` and `001_least_privilege_roles.sql` treat
`public.rls_auto_enable()` and the `ensure_rls` event trigger as load-bearing,
but **this repo contains only comments** — no `CREATE FUNCTION`, no
`CREATE EVENT TRIGGER`. A rebuild from this repo alone produces a database
with no auto-RLS.

**Do not invent the function.** Its body, event/tag filter, `search_path`,
security settings and exception handling are all unknown. A fabricated
privileged DDL trigger is worse than a documented gap.

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

See the TODO block in `db/roles/README.md`. Until the extracted definition
is version-controlled, rebuilds must either re-apply this from a live dump
or accept that new tables will not auto-enable RLS.
