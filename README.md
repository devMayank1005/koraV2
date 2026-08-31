# Kora v2

Rebuild of **Kora** — Kognoz Consulting's internal client-delivery tracker — on
Next.js + TypeScript, themed on the Kognoz brand, with the database migrated
from jsonb blobs to a normalized schema **in place** (same Supabase project, so
the data never moves providers).

The existing app in `../kora` stays deployed and untouched throughout; it is the
rollback path until cutover completes.

## Status

Stages 0–1 complete. The app is not yet wired to a live database.

| Area | State |
|---|---|
| Scaffold, theme, fonts | done |
| Kognoz design tokens + `k-*` component layer | done — review at `/styleguide` |
| Ported business logic + golden-master tests | done |
| Drizzle schema + numbered SQL migrations | done |
| Migration tooling (`preflight`/`backfill`/`verify`) | done, proven end-to-end |
| API, auth, screens | not started |

63 tests passing: golden-master parity, mapping rules, migration SQL against
real Postgres, and the full pipeline end-to-end.

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

`/styleguide` renders every design atom in both themes. It is the design
approval gate — screens are built from these atoms, so a wrong value there is a
wrong value everywhere.

```bash
pnpm test         # golden-master, mapping, schema and pipeline suites
pnpm typecheck
pnpm lint
pnpm build
```

## Migration

```bash
pnpm migrate:preflight    # read-only scan; produces the data-cleanup list
pnpm migrate:backfill     # dry run by default
pnpm migrate:backfill --execute --i-have-a-backup <dump>
pnpm migrate:verify       # the cutover gate — must exit 0
```

Put the connection string in `.env.local` (gitignored) as
`MIGRATION_DATABASE_URL`, using the Supabase **session-mode pooler on port
5432** — not 6543 (no prepared statements) and not `db.<ref>.supabase.co`
(IPv6-only on the free tier).

Every tool prints its target and mode before doing anything, and anything that
writes to a non-local database makes you type the environment name first.
`preflight` and `verify` never write. `backfill` runs in one transaction and
rolls back on any inconsistency; v1 is never written to, which is what keeps
rollback trivial.

See `db/migrations/APPLIED.md` for migration order and the two gates.

## Layout

```
app/            routes (App Router). /styleguide is the design reference.
components/     shared UI
lib/domain/     business logic — RAG calculations, retainer maths, constants
lib/utils/      dates, class merging
tests/golden/   differential tests against the original implementation
```

## The golden-master tests

The old app's business rules are subtle (three different RAG formulas, a
retainer pool where only the overage is billable) and a silent change to any of
them would quietly move every health indicator in the product.

So `tests/golden/` does not test my *reading* of that logic. It loads the
**original vanilla-JS functions** out of `../kora/js` into a VM and diffs them
against the TypeScript ports across 300 generated clients and five billing
windows, with fixtures deliberately landing on every threshold the rules hinge
on (0/1/7/14 days, exhausted pools, missing dates).

The suite has been mutation-checked: deliberately breaking a threshold or a
balance calculation makes it fail with a concrete input.

If `../kora` isn't present the suite skips rather than fails. Point it elsewhere
with `KORA_LEGACY_ROOT`.

## Conventions

- **Two radii exist**: `4px` and fully round. Nothing else.
- **Cards are flat at rest** — shadow on hover only, never a transform lift.
- **Never render a status `fill` colour as text.** Every hue has a `text`-safe
  pair; `/styleguide` shows them side by side and why.
- **No emoji in UI.** Icons are Lucide at `stroke-width: 1.5`, `currentColor`.
- Class names are `k-` prefixed. The design system's unprefixed `.h1`/`.body`
  are deliberately not shipped — they collide with Tailwind.
- Dark mode is a `dark` class on `<html>`, applied pre-paint and stored under
  the legacy `itk_dark` key so preferences survive cutover.

## Notes

- Next.js 16 renamed `middleware.ts` to **`proxy.ts`**, which runs on the
  Node.js runtime only. Check `node_modules/next/dist/docs/` before assuming an
  API — this version differs from most training data.
- Headings use **Carlito**, the metric-compatible open clone of Calibri, until a
  licensed Calibri is supplied.
- Migration reports and database dumps contain real client data and password
  hashes. They are gitignored and must never be committed.
