"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/fetcher";
import { keys } from "./keys";
import type { ClientTree } from "@/lib/db/queries/clients";
import type { Client } from "@/lib/domain/types";

/**
 * Writes.
 *
 * v1 hand-rolled this 48 times, in five different styles — object spread, deep
 * JSON clone, array index + splice, a Map of old values, push/pop — and two of
 * those copies were broken. `bulk-mark-complete` had no rollback at all, so a
 * failed save left phases locally marked Completed forever; and every
 * `Object.assign(entity, prev)` rollback was silently inert on conflict,
 * because the save had already replaced that object in the array and the
 * handler was mutating an orphan.
 *
 * One factory, so those are one implementation to get right rather than 48.
 */

/* ------------------------------------------------------------------ shapes */

export type EntityKind =
  | "client"
  | "integration"
  | "milestone"
  | "module"
  | "phase"
  | "workLog";

/** A single field patch, as the API's `.strict()` schemas expect it. */
export type Patch = Record<string, unknown>;

/* ------------------------------------------------- snake_case normalisation */

/**
 * `current` on a 409 comes from `to_jsonb(<table>)`, so it carries the
 * DATABASE's column names — `man_day_rate`, `next_action`, `activity_log` —
 * while every success response comes from Drizzle in camelCase.
 *
 * Healing from it without converting re-creates the exact failure that made
 * `toV1Shape` return clients with no modules and no dates: every lookup returns
 * undefined, nothing throws, and the result is structurally valid and empty.
 *
 * SHALLOW, for the same reason the forward direction is: jsonb payloads
 * (activity_log entries, edit history) carry camelCase keys that are stored
 * data, and rewriting those would corrupt the values being recovered.
 */
export function camelKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    // A LEADING underscore is left alone. `_v` is our own addition, not a
    // database column, and the naive rule turns it into `V` — which drops the
    // OCC token out of every conflict heal, silently, since the caller only
    // notices when the next save 428s for a missing precondition.
    out[
      k.startsWith("_")
        ? k
        : k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
    ] = v;
  }
  return out;
}

/**
 * The fresh row a conflict wants us to heal from, or null.
 *
 * NOT every 409 carries one. The OCC conflicts do, but constraint violations
 * ("A client with that name already exists.", "That username is already
 * taken.") and the restore-name clash are also 409 and carry neither `code` nor
 * `current`. Reading `.current` off those blindly yields undefined and heals
 * the row into nothing.
 */
export function conflictRow(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof ApiError) || !error.isConflict) return null;
  const current = error.body.current;
  if (!current || typeof current !== "object") return null;
  return camelKeys(current as Record<string, unknown>);
}

/**
 * Is this failure "someone else got there first", whatever status it arrived as?
 *
 * The activity index-race is the reason this is a function rather than a
 * `status === 409` check: editing or deleting an entry whose position shifted
 * returns **400** with "That entry moved while you were editing it", because
 * the entry id no longer matches the index. It is a conflict in every sense
 * that matters to the person looking at the screen.
 */
export function isConflict(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.isConflict) return true;
  return error.status === 400 && /moved while you were/i.test(error.message);
}

/* --------------------------------------------------------- patch building */

/**
 * Only the fields that actually changed, and only from a whitelist.
 *
 * Two hazards this closes, both of which are 400s rather than anything subtle:
 *
 * EVERY SCHEMA IS `.strict()`. Round-tripping a fetched row back into a PATCH
 * fails on `id`, `_v`, `clientId`, `createdAt` — keys the read path adds and
 * the write path refuses. So fields are named explicitly rather than diffed
 * wholesale.
 *
 * AN EMPTY PATCH IS A 400, NOT A NO-OP (`lib/api/mutate.ts:71-76`). An inline
 * field that blurs without being edited must therefore send nothing at all.
 *
 * `undefined` means "not in this patch" and `null` means "clear this field",
 * so a field that is absent from `next` is skipped while one explicitly set to
 * null is sent.
 */
export function buildPatch<T extends object>(
  before: T,
  // Keys are constrained to the entity; VALUES deliberately are not. A patch
  // sends `number` where the row holds a `string` (Postgres numeric), and
  // `null` to clear a field the row types as `string | undefined`. `Partial<T>`
  // would reject both — the two cases this function exists to handle.
  next: Partial<Record<keyof T, unknown>>,
  fields: readonly (keyof T)[],
): Patch {
  const patch: Patch = {};
  for (const f of fields) {
    if (!(f in next)) continue;
    const a = next[f];
    const b = before[f];
    // Numerics arrive as strings (Postgres `numeric`) and go out as numbers,
    // so compare loosely on value rather than on type — otherwise every save
    // re-sends every number.
    if (a === b) continue;
    if (a != null && b != null && Number(a) === Number(b) && a !== "" && b !== "") {
      continue;
    }
    patch[f as string] = a;
  }
  return patch;
}

/* ---------------------------------------------------- optimistic tree edits */

type Mutator = (entity: Record<string, unknown>) => Record<string, unknown>;

/**
 * Apply `fn` to one entity wherever it appears in a client tree.
 *
 * Rebuilds along the path rather than mutating: React Query hands out the
 * cached object itself, and mutating it would change what other components
 * already rendered without telling React anything happened.
 */
function editTree(
  tree: ClientTree,
  kind: EntityKind,
  id: string,
  fn: Mutator,
): ClientTree {
  const as = (v: unknown) => v as Record<string, unknown>;
  const hit = (e: { id: string }) => e.id === id;

  if (kind === "client") {
    return tree.id === id ? (fn(as(tree)) as unknown as ClientTree) : tree;
  }

  if (kind === "integration" || kind === "milestone") {
    return {
      ...tree,
      integrations: tree.integrations?.map((i) =>
        kind === "integration" && hit(i)
          ? (fn(as(i)) as unknown as typeof i)
          : {
              ...i,
              milestones: i.milestones?.map((m) =>
                hit(m) ? (fn(as(m)) as unknown as typeof m) : m,
              ),
            },
      ),
    };
  }

  if (kind === "module" || kind === "phase") {
    // `modules` is a sentinel key — present only when the client is in the
    // Implementation domain. Mapping a missing one would create it as `[]` and
    // move the client into a domain it is not in.
    if (!tree.modules) return tree;
    return {
      ...tree,
      modules: tree.modules.map((m) =>
        kind === "module" && hit(m)
          ? (fn(as(m)) as unknown as typeof m)
          : {
              ...m,
              phases: m.phases?.map((p) =>
                hit(p) ? (fn(as(p)) as unknown as typeof p) : p,
              ),
            },
      ),
    };
  }

  if (!tree.workLog) return tree;
  return {
    ...tree,
    workLog: tree.workLog.map((w) =>
      hit(w) ? (fn(as(w)) as unknown as typeof w) : w,
    ),
  };
}

/** Apply an edit to every cache entry holding this client. */
function editCaches(
  qc: QueryClient,
  clientId: string,
  kind: EntityKind,
  id: string,
  fn: Mutator,
) {
  qc.setQueryData<ClientTree[]>(keys.clients.tree(), (trees) =>
    trees?.map((t) => (t.id === clientId ? editTree(t, kind, id, fn) : t)),
  );
  qc.setQueryData<ClientTree>(keys.clients.one(clientId), (t) =>
    t ? editTree(t, kind, id, fn) : t,
  );
}

/* ------------------------------------------------------------ the factory */

interface UpdateArgs {
  /** The entity's current OCC token. Sent as If-Match. */
  version: string;
  patch: Patch;
}

/**
 * PATCH one entity, optimistically.
 *
 * The whole cache is snapshotted before the write and restored on failure —
 * one rollback path rather than the caller remembering a prior value. That is
 * what made v1's rollbacks unreliable: each of the 48 remembered a different
 * thing, and on conflict some of them were restoring an object the array no
 * longer contained.
 */
export function useUpdateEntity(
  kind: EntityKind,
  clientId: string,
  id: string,
  opts: { path: string; screen?: string } ,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ version, patch }: UpdateArgs) =>
      api<Record<string, unknown>>(opts.path, {
        method: "PATCH",
        body: patch,
        ifMatch: version,
        screen: opts.screen,
      }),

    async onMutate({ patch }) {
      // Stop in-flight refetches from landing on top of the optimistic edit
      // and reverting it a moment later.
      await qc.cancelQueries({ queryKey: keys.clients.all });
      const snapshot = qc.getQueriesData({ queryKey: keys.clients.all });
      editCaches(qc, clientId, kind, id, (e) => ({ ...e, ...patch }));
      return { snapshot };
    },

    onError(_err, _vars, ctx) {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
    },

    onSuccess(row) {
      // Take the server's row, not the optimistic guess: numerics come back as
      // strings, `updated_at` has advanced, and a trigger may have touched
      // something the client never sent.
      editCaches(qc, clientId, kind, id, (e) => ({ ...e, ...row }));
    },

    onSettled() {
      // Reconcile regardless. A conflict has already been rolled back, and this
      // pulls the winning version in behind the conflict card.
      void qc.invalidateQueries({ queryKey: keys.clients.all });
    },
  });
}

/** POST a child entity. No If-Match — a create has no prior version. */
export function useCreateEntity<TInput>(
  opts: { path: string; screen?: string },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      api<Record<string, unknown>>(opts.path, {
        method: "POST",
        body: input,
        screen: opts.screen,
      }),
    // Deliberately NOT optimistic: the server mints the id, and a create needs
    // a real row before anything can link to it.
    onSuccess() {
      void qc.invalidateQueries({ queryKey: keys.clients.all });
    },
  });
}

/** DELETE (soft — the server archives). If-Match required, like any write. */
export function useArchiveEntity(
  opts: { path: string; screen?: string },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: string) =>
      api<Record<string, unknown>>(opts.path, {
        method: "DELETE",
        ifMatch: version,
        screen: opts.screen,
      }),
    onSuccess() {
      void qc.invalidateQueries({ queryKey: keys.clients.all });
    },
  });
}

export type { Client };
