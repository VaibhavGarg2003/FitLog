# Constraint preflight

Read-only checks that count rows violating each CHECK predicate added by
`prisma/migrations/20260812010000_value_constraints` (as `NOT VALID`).

## Operator path

1. Run `check_constraint_violations.sql` against the target database.
2. Every `violation_count` must be **0**.
3. Only then run `db/validate/001_validate_constraints.sql` as **`postgres`**
   (break-glass), **not** `DIRECT_URL` / `fitlog_migrate`.

## Why this is outside `prisma migrate deploy`

`prisma migrate deploy` applies every unapplied file under `prisma/migrations/`
in directory order. A committed `VALIDATE CONSTRAINT` migration would therefore
run automatically on the next deploy and fail against residual production data.
Preflight → validate is an operator step on purpose.
