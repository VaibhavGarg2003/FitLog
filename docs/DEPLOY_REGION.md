# Why `vercel.json` pins the region to `syd1`

## The problem this fixes

Logging a single set took **~2.9 seconds** in production. It was not query cost —
it was geography.

`X-Vercel-Id: bom1::iad1::...` on a production response decodes as:

| Code | Meaning |
|---|---|
| `bom1` | Mumbai — the edge that *received* the request |
| `iad1` | Washington DC — where the serverless function actually *executed* |

And the Supabase database lives in `aws-1-ap-southeast-2` — **Sydney**.

So every query went **India → Washington DC → Sydney → back**. The compute sat on
the opposite side of the planet from both the user and the database.

## Measured

Against the production database:

| Measurement | Result |
|---|---|
| One query **including** connection setup | ~2,300 ms |
| 20 queries on an **already-open** connection | 2,740 ms total (~20 ms each) |

Connection establishment dominates. TLS + pooler auth is several round trips, so a
cold serverless invocation paid roughly a full second before running any SQL.

`addSet` also makes ~8 round trips (BEGIN, `SELECT … FOR UPDATE`, idempotency
lookup, `max(set_number)`, INSERT, activity touch, COMMIT). That is deliberate —
each one buys a correctness property (see `workout.repository.ts`) — but at
~220 ms per hop between `iad1` and Sydney it added ~1.8 s on its own.

## The fix

Run the function in the same region as the database:

```json
{ "regions": ["syd1"] }
```

Function ↔ database drops from ~220 ms per round trip to ~1–2 ms. The user's own
hop becomes Mumbai → Sydney (~150 ms) but that is paid **once per request**, not
once per query.

## Why not Mumbai (`bom1`), closer to the user?

Because a request makes many database round trips and only one user round trip:

| Function region | User hop | 8 DB hops | Total |
|---|---|---|---|
| `iad1` (current) | ~250 ms | ~1,760 ms | **~2,000 ms** |
| `bom1` (Mumbai) | ~20 ms | ~1,200 ms | ~1,220 ms |
| `sin1` (Singapore) | ~60 ms | ~760 ms | ~820 ms |
| **`syd1` (Sydney)** | ~150 ms | **~16 ms** | **~165 ms** |

Colocating with the database wins by an order of magnitude. Put compute next to
the data it queries, not next to the user, whenever a request is database-heavy.

## If the database ever moves

This pin must move with it. A `vercel.json` region that no longer matches the
Supabase region silently reintroduces exactly this problem — slow, with nothing
in the code to explain why.

## Verifying it worked

```bash
curl -s -o /dev/null -D - https://<your-domain>/ | grep -i x-vercel-id
```

The **second** segment is the execution region. Expect `…::syd1::…`.
