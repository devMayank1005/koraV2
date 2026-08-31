# Applied migrations

Numbered SQL, applied in order, by hand. There is no migration runner — at this
scale one is more risk than it removes, and the standing project rule is that
SQL is applied and verified before the code that depends on it ships.

```bash
psql "$KORA_DB_URL" -f db/migrations/000N_name.sql
```

Record every application below, including the environment. If a file is ever
edited after being applied somewhere, add a new numbered file instead — never
retro-edit an applied one.

| # | File | Local / Docker | Staging | Production | Notes |
|---|------|----------------|---------|------------|-------|
| 0001 | `0001_baseline_v1_schema.sql` | — | — | **never** | Reconstruction for local use only. Replace with real `pg_dump --schema-only` output. Must NOT be applied to live. |
| 0002 | `0002_v2_schema.sql` | — | — | already applied | As-applied record of the original `sql_v2_migration.sql`. Idempotent. |
| 0003 | `0003_domain_membership.sql` | — | — | — | Additive; safe to apply while the old app runs. Required before backfill. |
| 0004 | `0004_client_name_ci_unique.sql` | — | — | — | **Gate.** Apply only after preflight reports zero duplicate client names. |
| 0005 | `0005_backend_indexes.sql` | — | — | — | Additive. Fails if two usernames collide case-insensitively. |

## Order and dependencies

- `0003` and `0005` are additive and independent — apply any time.
- `0004` depends on the live data being clean. Run `pnpm migrate:preflight`
  first; it fails loudly rather than letting duplicates through.
- `0001` is for building throwaway databases only. Applying it to an
  environment that already has real `clients` data does nothing (`if not
  exists`), but it must never be treated as the authoritative v1 schema.

## Connection string

Use the Supabase **session-mode pooler** on port 5432:

```
postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

Not the direct host (`db.<ref>.supabase.co`) — on the free tier it is IPv6-only
and unreachable from most networks and from Vercel. Not transaction mode
(port 6543) either: it does not support the prepared statements `psql` and
`pg_dump` rely on. The application uses port 6543; tooling uses 5432.
