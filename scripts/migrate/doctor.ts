/**
 * doctor — pre-migration environment check.
 *
 *   pnpm migrate:doctor
 *
 * Answers "is it safe to apply the migrations, and what state is this database
 * actually in?" before anything is changed. Two of the migrations create unique
 * indexes and will fail outright on colliding data; far better to learn that
 * here than from a half-applied migration.
 *
 * Read-only.
 */
import { announce, connect, resolveTarget } from "./lib/db";

interface Check {
  name: string;
  status: "ok" | "warn" | "blocked" | "todo";
  detail: string;
}

async function main() {
  const target = resolveTarget();
  announce("doctor — pre-migration checks", target, "read-only");

  const sql = connect(target);
  const checks: Check[] = [];

  try {
    // --- what is already applied ----------------------------------------
    const cols = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_name = 'clients_v2'
        and column_name in ('has_implementation', 'has_ams')
    `;
    checks.push({
      name: "0003 domain membership",
      status: cols.length === 2 ? "ok" : "todo",
      detail: cols.length === 2 ? "columns present" : "not applied yet",
    });

    const idx = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in ('uq_clients_v2_name_ci_active',
                          'uq_users_username_ci',
                          'idx_audit_log_ts')
    `;
    const have = new Set(idx.map((i) => i.indexname));
    checks.push({
      name: "0004 client name unique",
      status: have.has("uq_clients_v2_name_ci_active") ? "ok" : "todo",
      detail: have.has("uq_clients_v2_name_ci_active") ? "index present" : "not applied yet",
    });
    checks.push({
      name: "0005 backend indexes",
      status: have.has("uq_users_username_ci") && have.has("idx_audit_log_ts") ? "ok" : "todo",
      detail: `${have.size} of 3 target indexes present`,
    });

    const rl = await sql<{ e: boolean }[]>`
      select to_regclass('public.rate_limits') is not null as e
    `;
    checks.push({
      name: "rate_limits table",
      status: rl[0].e ? "ok" : "todo",
      detail: rl[0].e ? "exists" : "created by 0005",
    });

    // --- data that would block a unique index ----------------------------
    const dupUsers = await sql<{ k: string; n: number; us: string[] }[]>`
      select lower(username) k, count(*)::int n, array_agg(username) us
      from users group by 1 having count(*) > 1
    `;
    checks.push({
      name: "usernames unique (case-insensitively)",
      status: dupUsers.length ? "blocked" : "ok",
      detail: dupUsers.length
        ? dupUsers.map((d) => `${d.us.join(" / ")}`).join("; ")
        : "no collisions — 0005 will apply",
    });

    const dupV2 = await sql<{ k: string; ids: string[] }[]>`
      select lower(trim(name)) k, array_agg(id) ids
      from clients_v2 where archived = false
      group by 1 having count(*) > 1
    `;
    checks.push({
      name: "clients_v2 names unique (case-insensitively)",
      status: dupV2.length ? "blocked" : "ok",
      detail: dupV2.length
        ? dupV2.map((d) => `"${d.k}" -> ${d.ids.join(", ")}`).join("; ")
        : "no duplicates — 0004 will apply",
    });

    const dupV1 = await sql<{ k: string; ids: string[] }[]>`
      select lower(trim(name)) k, array_agg(id) ids
      from clients group by 1 having count(*) > 1
    `;
    checks.push({
      name: "v1 client names unique",
      status: dupV1.length ? "blocked" : "ok",
      detail: dupV1.length
        ? dupV1.map((d) => `"${d.k}" -> ${d.ids.join(", ")}`).join("; ")
        : "no duplicates",
    });

    // --- shadow-schema drift ---------------------------------------------
    // The v2 tables are dual-write output and drift from v1 over time. It does
    // not matter — the backfill rebuilds them — but a large divergence is worth
    // seeing, since it is the clearest measure of how unreliable that path was.
    const [{ v1, v2 }] = await sql<{ v1: number; v2: number }[]>`
      select
        (select coalesce(sum(jsonb_array_length(integrations)), 0)::int from clients) as v1,
        (select count(*)::int from integrations_v2 where archived = false)            as v2
    `;
    checks.push({
      name: "integrations: v1 vs v2 shadow",
      status: v1 === v2 ? "ok" : "warn",
      detail:
        v1 === v2
          ? `both ${v1}`
          : `v1=${v1} v2=${v2} — dual-write drift, resolved by the rebuild`,
    });

    const orphans = await sql<{ id: string; name: string; archived: boolean }[]>`
      select i.id, i.name, i.archived
      from integrations_v2 i
      where not exists (
        select 1 from clients c, jsonb_array_elements(c.integrations) e
        where e->>'id' = i.id
      )
    `;
    checks.push({
      name: "v2 rows with no v1 counterpart",
      status: orphans.length ? "warn" : "ok",
      detail: orphans.length
        ? orphans.map((o) => `${o.name} (${o.id}${o.archived ? ", archived" : ""})`).join("; ")
        : "none",
    });

    // --- output -----------------------------------------------------------
    const symbol = { ok: "ok  ", warn: "warn", blocked: "BLOCK", todo: "todo" };
    const width = Math.max(...checks.map((c) => c.name.length));
    for (const c of checks) {
      console.log(`  [${symbol[c.status]}] ${c.name.padEnd(width)}  ${c.detail}`);
    }

    const blocked = checks.filter((c) => c.status === "blocked");
    const todo = checks.filter((c) => c.status === "todo");

    console.log("");
    if (blocked.length) {
      console.log(`  ${blocked.length} blocking issue(s) — resolve before applying migrations.\n`);
      process.exit(1);
    }
    console.log(
      todo.length
        ? `  Safe to apply: ${todo.map((t) => t.name).join(", ")}\n`
        : "  All migrations already applied.\n",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\n  doctor failed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
