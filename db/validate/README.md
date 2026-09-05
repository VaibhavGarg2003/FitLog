# Constraint validation (operator-run)

`001_validate_constraints.sql` runs `VALIDATE CONSTRAINT` for every check
added as `NOT VALID` in `prisma/migrations/20260812010000_value_constraints`.

## Prerequisites

1. `db/preflight/check_constraint_violations.sql` returned **zero** violations.
2. You are connected as **`postgres`** (break-glass), not `fitlog_migrate` and
   not `fitlog_app`.

## Why this is outside `prisma migrate deploy`

See `db/preflight/README.md`. Validation is deliberately not part of the
migration stream so a deploy cannot fail on historical data the NOT VALID
checks already protect against for new writes.
