/**
 * preflight — read-only data-quality scan of the live v1 data.
 *
 * Runs the real mapping over every client and reports what would happen,
 * writing nothing anywhere. Its job is to surface the records a human must fix
 * in the old app BEFORE the migration runs, because the alternative is finding
 * them mid-cutover with everyone locked out.
 *
 *   pnpm migrate:preflight
 *
 * Exits non-zero if any blocking issue is found.
 */
import { announce, connect, resolveTarget } from "./lib/db";
import { fromPostgresJs } from "./lib/executor";
import { readV1Clients } from "./lib/read-v1";
import { planBackfill } from "./lib/backfill-core";
import { countAttachments } from "./lib/attachments";
import { printSummary, printTable, writeReport } from "./lib/report";

async function main() {
  const target = resolveTarget();
  announce("preflight — read-only scan", target, "no writes");

  const sql = connect(target);
  const exec = fromPostgresJs(sql);

  try {
    const [{ ok }] = await exec.query<{ ok: boolean }>(
      `select to_regclass('public.clients') is not null as ok`,
    );
    if (!ok) {
      console.error(
        "  The v1 `clients` table does not exist on this target.\n" +
          "  Point MIGRATION_DATABASE_URL at the database holding live v1 data.\n",
      );
      process.exit(2);
    }

    const clients = await readV1Clients(exec);
    console.log(`  Read ${clients.length} client rows.\n`);

    const { log, tallies, mapped } = planBackfill(clients);

    // Cross-client checks the per-client mapper cannot see.
    const nameKeys = new Map<string, string[]>();
    for (const c of clients) {
      const key = (c.name ?? "").trim().toLowerCase();
      if (!key) continue;
      nameKeys.set(key, [...(nameKeys.get(key) ?? []), c.id]);
    }
    for (const [key, ids] of nameKeys) {
      if (ids.length > 1) {
        log.add("NAME_DUPLICATE_CI", ids.join(", "), key,
          `${ids.length} active clients share this name`);
      }
    }

    const attachments = countAttachments(
      mapped.flatMap((m) => [
        ...m.integrations.map((i) => i.activity_log),
        ...m.phases.map((p) => p.activity_log),
      ]),
    );

    const membership = {
      implementation: mapped.filter((m) => m.client.has_implementation).length,
      ams: mapped.filter((m) => m.client.has_ams).length,
      integrationsOnly: mapped.filter(
        (m) => !m.client.has_implementation && !m.client.has_ams,
      ).length,
    };

    const activityEntries = mapped.reduce(
      (a, m) =>
        a +
        m.integrations.reduce((x, i) => x + i.activity_log.length, 0) +
        m.phases.reduce((x, p) => x + p.activity_log.length, 0),
      0,
    );

    console.log("  Inventory");
    printTable(
      [
        { metric: "clients", count: tallies.clients },
        { metric: "integrations", count: tallies.integrations },
        { metric: "milestones", count: tallies.milestones },
        { metric: "modules", count: tallies.modules },
        { metric: "phases", count: tallies.phases },
        { metric: "ams work-log entries", count: tallies.workLog },
        { metric: "activity entries", count: activityEntries },
        { metric: "attachments", count: attachments.total },
        { metric: "  … resolvable to a path", count: attachments.withPath },
      ],
      ["metric", "count"],
    );

    console.log("\n  Domain membership (from the v1 null-sentinel)");
    printTable(
      [
        { domain: "Implementation", clients: membership.implementation },
        { domain: "AMS & Support", clients: membership.ams },
        { domain: "Integrations only", clients: membership.integrationsOnly },
      ],
      ["domain", "clients"],
    );

    printSummary(log);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = writeReport(`preflight-${stamp}`, {
      target: target.label,
      generatedAt: new Date().toISOString(),
      tallies,
      membership,
      attachments,
      perClient: mapped.map((m) => ({
        id: m.client.id,
        name: m.client.name,
        integrations: m.integrations.length,
        milestones: m.milestones.length,
        modules: m.modules.length,
        phases: m.phases.length,
        workLog: m.workLog.length,
        hasImplementation: m.client.has_implementation,
        hasAms: m.client.has_ams,
      })),
      counts: log.counts(),
      issues: log.issues,
    });

    console.log(`\n  Full report: ${file}`);

    if (log.hasGates) {
      console.log(
        `\n  RESULT: ${log.gates.length} blocking issue(s).\n` +
          `  Fix these in the old app, then re-run. Migration 0004 and\n` +
          `  backfill --execute stay blocked until this is clean.\n`,
      );
      process.exit(1);
    }

    console.log(
      `\n  RESULT: clean — no blocking issues.\n` +
        `  Safe to apply 0004 and to run backfill --dry-run.\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\n  preflight failed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
