-- ============================================================================
-- 0001 — BASELINE v1 SCHEMA  ***RECONSTRUCTION, NOT AUTHORITATIVE***
-- ============================================================================
-- The v1 schema exists nowhere except the live Supabase database: the original
-- repo never contained a migration for it. This file is reconstructed from the
-- queries the old app actually issues (api/read.js, api/write.js, api/login.js,
-- api/_audit.js, api/_throttle.js, api/snapshot.js, api/ops.js).
--
-- DO NOT APPLY THIS TO THE LIVE DATABASE. It exists so a local/Docker/CI
-- database can be stood up for testing the migration tooling.
--
-- REPLACE THIS FILE with real output once credentials are available:
--   pg_dump "$KORA_DB_URL" --schema=public --schema-only --no-owner \
--           --no-privileges --file=db/migrations/0001_baseline_v1_schema.sql
--
-- Columns marked UNVERIFIED are inferred from usage; the app never states
-- their exact type because it only ever reads them or lets the DB default them.
-- ============================================================================

create table if not exists clients (
  id                      text primary key,
  name                    text,
  description             text default '',
  -- Domain membership is encoded in the NULL-ness of these two columns:
  --   modules IS NULL  -> not in the Implementation domain
  --   modules = '[]'   -> in the domain, zero modules
  -- Same for work_log / AMS. v2 replaces this with explicit booleans.
  integrations            jsonb default '[]'::jsonb,
  modules                 jsonb,
  work_log                jsonb,
  man_day_rate            numeric,
  total_available_hours   numeric,
  currency                text default 'INR',
  master_assignee         text,
  created_at              timestamptz default now(),
  -- Doubles as the optimistic-concurrency token, surfaced to clients as `_v`.
  updated_at              timestamptz default now()
);

create table if not exists users (
  id              text primary key,
  username        text not null,
  name            text,
  email           text,
  role            text not null default 'viewer',
  -- bcrypt ($2a/$2b/$2y, cost 12) or a legacy SHA-256 hex digest that gets
  -- lazily rehashed to bcrypt on the user's next successful login.
  password_hash   text,
  token_version   integer not null default 0,
  failed_attempts integer not null default 0,
  lockout_level   integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Append-only. Writes are best-effort and never block the calling request.
create table if not exists audit_log (
  -- UNVERIFIED: api/_audit.js never sends id or ts, so both are DB-generated.
  -- uuid + gen_random_uuid() is the Supabase default shape; the live column
  -- could equally be bigint identity. Reads treat it as an opaque string.
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  actor_id    text,
  username    text,
  role        text,
  action      text,
  entity      text,
  screen      text,
  ip          text,
  user_agent  text
);

-- Per-IP login throttle: 20 attempts / 15 min window -> 15 min lock.
-- Upserted on conflict (ip), so ip must be the primary key.
create table if not exists login_ip_throttle (
  ip             text primary key,
  attempt_count  integer not null default 0,
  window_start   timestamptz,
  locked_until   timestamptz,
  updated_at     timestamptz
);

-- Upserted on conflict (snapshot_date, client_id) by api/snapshot.js, so that
-- pair must carry a unique constraint.
create table if not exists portfolio_snapshots (
  snapshot_date          date not null,
  client_id              text not null,
  client_name            text,
  integ_total            integer,
  integ_at_risk          integer,
  integ_in_progress      integer,
  integ_completed        integer,
  impl_rag               text,
  impl_total_phases      integer,
  impl_completed_phases  integer,
  ams_rag                text,
  ams_open_entries       integer,
  ams_open_l3l4          integer,
  ams_hours_month        numeric,   -- admin-only; stripped for other roles
  overall_rag            text,
  primary key (snapshot_date, client_id)
);

-- Upserted on conflict (key). Only two keys are ever written:
--   capacity_weights  {module, pmo, ams, cap}
--   digest_recipients {emails: []}
create table if not exists app_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz default now(),
  updated_by  text
);
