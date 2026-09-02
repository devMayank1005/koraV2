"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api/fetcher";
import { keys } from "./keys";
import type { ClientSummary, ClientTree } from "@/lib/db/queries/clients";
import type { UserOption, UserAdminView } from "@/lib/db/queries/users";
import type { SnapshotRow as DbSnapshotRow } from "@/lib/db/queries/misc";
import type {
  SnapshotRow as DomainSnapshotRow,
  CapacityWeights,
} from "@/lib/domain/dashboard";
import { DEFAULT_CAPACITY_WEIGHTS } from "@/lib/domain/constants";

/**
 * The read hooks every screen is built on.
 *
 * These import their types straight from the query modules that produce them
 * (`lib/db/queries/*`), so the wire contract is checked by the compiler rather
 * than restated. A hand-written `lib/types/api.ts` mirroring those shapes was
 * the original plan; it would be a second definition of the same thing, free
 * to drift, and drift here is silent — the JSON still parses, the field is just
 * `undefined`. That exact failure already cost this project once, when
 * `toV1Shape` read snake_case keys against camelCase rows and returned clients
 * with no modules, no work log and no dates, all structurally valid.
 *
 * Importing a server module's TYPES into client code is free: `import type` is
 * erased at compile time, so no query builder or database driver reaches the
 * browser bundle.
 */

/* ------------------------------------------------------------------ clients */

/**
 * Every client, fully nested — the shape the dashboard and all four trackers
 * aggregate over.
 *
 * ONE query serves all of them, deliberately. The old app made a single `read`
 * call and computed every tile in the browser; keeping that shape means the
 * dashboard, the integrations rail and the AMS gauge share one cache entry and
 * one 60-second refetch instead of racing three overlapping requests. At 22
 * clients and 702 phases the payload is small enough that this is simply
 * cheaper than being clever.
 */
export function useClientTrees(): UseQueryResult<ClientTree[]> {
  return useQuery({
    queryKey: keys.clients.tree(),
    queryFn: () =>
      api<{ clients: ClientTree[]; signedAttachments: number }>(
        "/api/clients?view=tree",
      ).then((r) => r.clients),
  });
}

/**
 * The list with per-domain counts, for the client rails.
 *
 * Separate from the tree because a rail needs 22 rows and four integers, and
 * making it wait on 702 phases would leave the most visible element on the
 * screen blank the longest.
 */
export function useClientList(): UseQueryResult<ClientSummary[]> {
  return useQuery({
    queryKey: keys.clients.list(),
    queryFn: () =>
      api<{ clients: ClientSummary[] }>("/api/clients").then((r) => r.clients),
  });
}

/**
 * One client's tree.
 *
 * `enabled` guards the undefined case rather than the caller branching around
 * the hook: hooks cannot be called conditionally, and every detail screen has a
 * moment before its route param resolves.
 */
export function useClient(
  clientId: string | undefined,
): UseQueryResult<ClientTree> {
  return useQuery({
    queryKey: keys.clients.one(clientId ?? ""),
    enabled: Boolean(clientId),
    queryFn: () =>
      api<{ client: ClientTree }>(
        `/api/clients/${encodeURIComponent(clientId!)}`,
      ).then((r) => r.client),
  });
}

/* -------------------------------------------------------------------- users */

/**
 * Users, for assignee labels and the admin table.
 *
 * The response is ROLE-SHAPED by the server: an admin receives lockout state
 * and email, everyone else receives four fields. The union type is therefore
 * the honest description of what arrives, and callers that want the admin
 * fields must narrow — which is the point. Typing this as `UserAdminView[]`
 * would let a viewer-facing screen reference `lockedUntil` and compile
 * cleanly, then render `undefined` in production.
 */
export function useUsers(): UseQueryResult<(UserOption | UserAdminView)[]> {
  return useQuery({
    queryKey: keys.users.list(),
    queryFn: () =>
      api<{ users: (UserOption | UserAdminView)[] }>("/api/users").then(
        (r) => r.users,
      ),
    // Names and roles change on the timescale of someone joining the company.
    staleTime: 5 * 60_000,
  });
}

/** A lookup from username to display name, which is what screens actually use. */
export function useUserNames(): Map<string, string> {
  const { data } = useUsers();
  return new Map((data ?? []).map((u) => [u.username, u.name]));
}

/* ------------------------------------------------ snapshots and settings */

/**
 * Portfolio snapshots, for the dashboard's trend arrows.
 *
 * MAPPED TO SNAKE_CASE ON THE WAY OUT, which looks wrong and is not. The
 * domain's `healthRows` reads `client_id` / `snapshot_date` / `overall_rag`,
 * because it is a verbatim port of the original, and the golden tests diff it
 * against that original over generated fixtures. Renaming its fields to match
 * this codebase's camelCase would mean editing the thing the golden test is
 * supposed to hold still.
 *
 * So the boundary converts, here, once. This is exactly the shape mismatch
 * that made `toV1Shape` return clients with no modules and no dates — snake
 * against camel, every lookup `undefined`, every result structurally valid and
 * empty. There it was silent because the reader took `any`. Here the two
 * interfaces genuinely differ, so leaving it unmapped is a type error rather
 * than a blank trend column.
 */
export function useSnapshots(): UseQueryResult<DomainSnapshotRow[]> {
  return useQuery({
    queryKey: keys.snapshots.list(),
    queryFn: () =>
      api<{ rows: DbSnapshotRow[] }>("/api/snapshots").then((r) =>
        r.rows.map((s) => ({
          client_id: s.clientId,
          snapshot_date: s.snapshotDate,
          overall_rag: s.overallRag,
        })),
      ),
    // Snapshots are written once a night. Re-fetching them every 60s asks the
    // database for yesterday's answer over and over.
    staleTime: 10 * 60_000,
    refetchInterval: false,
  });
}

/**
 * Capacity weights for the bandwidth tile.
 *
 * Falls back to the defaults rather than failing the tile: the setting is
 * optional, and a team-load chart that disappears because nobody configured a
 * weight is worse than one drawn with the documented defaults.
 */
export function useCapacityWeights(): CapacityWeights {
  const { data } = useQuery({
    queryKey: keys.settings.capacityWeights(),
    queryFn: () =>
      api<{ capacityWeights: Partial<CapacityWeights> }>(
        "/api/settings/capacity-weights",
      ).then((r) => r.capacityWeights),
    staleTime: 10 * 60_000,
    refetchInterval: false,
  });
  return { ...DEFAULT_CAPACITY_WEIGHTS, ...(data ?? {}) };
}

/* --------------------------------------------------------------- cache-only */

/**
 * Whatever is ALREADY cached, without ever issuing a request.
 *
 * `enabled: false` is the whole point: the hook subscribes to a cache entry and
 * re-renders when it changes, but never fetches it itself. That makes it safe
 * in the app chrome, which renders on every route including ones that have no
 * business loading the client list — the breadcrumbs want a name to display,
 * not a reason to make a request.
 *
 * Returns an empty map until something else populates the cache, so callers
 * must have a fallback. On the tracker screens the rail has already fetched it
 * and the name is there on first paint; on `/admin` it stays empty and the
 * breadcrumb keeps showing the id, which is correct — a label is not worth a
 * round trip.
 */
export function useCachedClientNames(): Map<string, string> {
  const { data } = useQuery({
    queryKey: keys.clients.list(),
    queryFn: () =>
      api<{ clients: ClientSummary[] }>("/api/clients").then((r) => r.clients),
    enabled: false,
    staleTime: Infinity,
  });
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}

/**
 * Names for the ids nested UNDER a client — integrations, modules — read from
 * that client's cached tree. Same contract: cache only, never a request.
 */
export function useCachedChildNames(
  clientId: string | undefined,
): Map<string, string> {
  const { data } = useQuery({
    queryKey: keys.clients.one(clientId ?? ""),
    queryFn: () =>
      api<{ client: ClientTree }>(
        `/api/clients/${encodeURIComponent(clientId!)}`,
      ).then((r) => r.client),
    enabled: false,
    staleTime: Infinity,
  });

  const names = new Map<string, string>();
  for (const i of data?.integrations ?? []) names.set(i.id, i.name);
  for (const m of data?.modules ?? []) names.set(m.id, m.name);
  return names;
}
