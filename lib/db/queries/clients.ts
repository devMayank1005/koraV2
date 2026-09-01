import { eq, and, inArray, asc, sql, getTableColumns } from "drizzle-orm";
import {
  clients,
  integrations,
  milestones,
  modules,
  phases,
  amsWorkLog,
} from "@/lib/db/schema";
import { toV1Shape } from "@/lib/db/inverse";
import { vToken } from "@/lib/db/occ";
import { qualify } from "@/lib/db/sql";
import type { AnyDb } from "@/lib/auth/db-types";
import type { Client } from "@/lib/domain/types";

/**
 * Client reads, from the v2 tables.
 *
 * This is the first code in the project to READ v2 — dual-write only ever
 * wrote there. Shaping back into the v1 camelCase structure goes through
 * lib/db/inverse.ts, the same function `migrate:verify` uses to prove the
 * migration was faithful. Sharing it means the API cannot disagree with the
 * thing that certified the data.
 *
 * Every query filters `archived = false`. Soft-deleted rows stay in the
 * database forever by design; the application must never see them.
 */

export interface ClientSummary {
  id: string;
  name: string;
  description: string;
  currency: string;
  masterAssignee: string | null;
  manDayRate: number | null;
  totalAvailableHours: number | null;
  hasImplementation: boolean;
  hasAms: boolean;
  /** Optimistic-concurrency token. */
  _v: string;
  counts: {
    integrations: number;
    modules: number;
    phases: number;
    workLog: number;
  };
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * Client list with per-domain counts.
 *
 * The counts come from grouped subqueries rather than a query per client —
 * with 22 clients an N+1 would be 89 round trips through a pooled connection,
 * and the rail renders them all at once.
 */
export async function listClients(db: AnyDb): Promise<ClientSummary[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      description: clients.description,
      currency: clients.currency,
      masterAssignee: clients.masterAssignee,
      manDayRate: clients.manDayRate,
      totalAvailableHours: clients.totalAvailableHours,
      hasImplementation: clients.hasImplementation,
      hasAms: clients.hasAms,
      _v: vToken(clients.updatedAt),
      integrationCount: sql<number>`(
        select count(*)::int from ${integrations} i
        where i.client_id = ${qualify(clients.id)} and i.archived = false)`,
      moduleCount: sql<number>`(
        select count(*)::int from ${modules} m
        where m.client_id = ${qualify(clients.id)} and m.archived = false)`,
      phaseCount: sql<number>`(
        select count(*)::int from ${phases} p
        where p.client_id = ${qualify(clients.id)} and p.archived = false)`,
      workLogCount: sql<number>`(
        select count(*)::int from ${amsWorkLog} w
        where w.client_id = ${qualify(clients.id)} and w.archived = false)`,
    })
    .from(clients)
    .where(eq(clients.archived, false))
    .orderBy(asc(clients.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    currency: r.currency,
    masterAssignee: r.masterAssignee,
    manDayRate: num(r.manDayRate),
    totalAvailableHours: num(r.totalAvailableHours),
    hasImplementation: r.hasImplementation,
    hasAms: r.hasAms,
    _v: r._v,
    counts: {
      integrations: r.integrationCount,
      modules: r.moduleCount,
      phases: r.phaseCount,
      workLog: r.workLogCount,
    },
  }));
}

/** A client DTO: the v1 shape the frontend expects, plus its OCC token. */
export type ClientTree = Client & { _v: string };

/**
 * Full nested tree for one or all clients.
 *
 * Six queries total regardless of how many clients are asked for — one per
 * table, assembled in memory — rather than walking the tree per client. At
 * 702 phases the difference is the whole response time.
 *
 * Attachment URLs are NOT signed here; the caller does that once for the whole
 * payload so the signing round trip is shared.
 */
export async function getClientTrees(
  db: AnyDb,
  clientIds?: string[],
): Promise<ClientTree[]> {
  const active = <T extends { archived: unknown; clientId?: unknown }>(
    table: T,
  ) =>
    clientIds
      ? and(
          eq(table.archived as never, false),
          inArray(table.clientId as never, clientIds),
        )
      : eq(table.archived as never, false);

  const clientWhere = clientIds
    ? and(eq(clients.archived, false), inArray(clients.id, clientIds))
    : eq(clients.archived, false);

  const [cRows, iRows, msRows, mRows, pRows, wRows] = await Promise.all([
    db
      .select({ ...getTableColumns(clients), _v: vToken(clients.updatedAt) })
      .from(clients)
      .where(clientWhere)
      .orderBy(asc(clients.name)),
    db.select().from(integrations).where(active(integrations)),
    db.select().from(milestones).where(active(milestones)),
    db.select().from(modules).where(active(modules)),
    db.select().from(phases).where(active(phases)),
    db.select().from(amsWorkLog).where(active(amsWorkLog)),
  ]);

  // Bucket the children by client once, so assembly is linear rather than a
  // filter pass per client per table.
  const bucket = <T extends { clientId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.clientId);
      if (list) list.push(r);
      else m.set(r.clientId, [r]);
    }
    return m;
  };

  const byClient = {
    integrations: bucket(iRows),
    milestones: bucket(msRows),
    modules: bucket(mRows),
    phases: bucket(pRows),
    workLog: bucket(wRows),
  };

  return cRows.map((c) => {
    const shaped = toV1Shape({
      client: c as unknown as Record<string, unknown>,
      integrations: (byClient.integrations.get(c.id) ??
        []) as unknown as Record<string, unknown>[],
      milestones: (byClient.milestones.get(c.id) ??
        []) as unknown as Record<string, unknown>[],
      modules: (byClient.modules.get(c.id) ??
        []) as unknown as Record<string, unknown>[],
      phases: (byClient.phases.get(c.id) ??
        []) as unknown as Record<string, unknown>[],
      workLog: (byClient.workLog.get(c.id) ??
        []) as unknown as Record<string, unknown>[],
    });

    // `_v` is the row's updated_at and is what a later PATCH must echo back in
    // If-Match. It is deliberately not part of the v1 shape, so it is attached
    // here rather than inside the shared shaping function.
    return { ...shaped, _v: c._v };
  });
}

export async function getClientTree(
  db: AnyDb,
  clientId: string,
): Promise<ClientTree | null> {
  const [tree] = await getClientTrees(db, [clientId]);
  return tree ?? null;
}
