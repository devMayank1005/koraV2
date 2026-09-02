"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api/fetcher";
import { keys } from "./keys";
import type { ClientSummary, ClientTree } from "@/lib/db/queries/clients";
import type { UserOption, UserAdminView } from "@/lib/db/queries/users";

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
