-- Profile timezone — the user's IANA zone, reported by their browser
-- ══════════════════════════════════════════════════════════════════
--
-- WHY: the server runs in UTC and has no idea what calendar day it is for the
-- user. Today every "today" has to arrive from the client (?date=). Anything
-- the server must decide ON ITS OWN — which day a target change takes effect,
-- whether a week or month has finished — needs the zone stored.
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS: nullable, no default, no backfill.
-- Adding a nullable column without a default is a catalog-only change in
-- Postgres (no table rewrite), and old code never selects it.
--
-- Existing rows stay NULL until the user next opens the app or saves Settings,
-- when components/shared/timezone-sync.tsx / recalculateProfile fill it in.
--
-- Hand-written, not `prisma migrate diff` output: the diff against the live
-- database also proposes dropping the Django-owned tables (auth_*, django_*,
-- share_links), which Prisma does not model and must never touch.

ALTER TABLE "profiles" ADD COLUMN "timezone" TEXT;

-- Real validation (is this a zone Intl recognises?) lives in the app — the
-- database cannot evaluate IANA names. This only stops garbage-sized values,
-- matching the value-constraint style of 20260812010000_value_constraints.
--
-- NOT VALID: without it, ADD CONSTRAINT scans every profiles row while holding
-- the ACCESS EXCLUSIVE lock ADD COLUMN already took, blocking profile writes
-- for the duration. The scan would prove nothing — the column was added one
-- statement ago and every existing row is NULL, which the check allows. New
-- and updated rows are checked either way.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_timezone_check"
  CHECK ("timezone" IS NULL OR char_length("timezone") BETWEEN 1 AND 64)
  NOT VALID;
