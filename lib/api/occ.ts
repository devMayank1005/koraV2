import type { NextRequest } from "next/server";
import { AppError, conflict, notFound } from "./errors";

/**
 * Optimistic concurrency at the request boundary.
 *
 * Kora is a shared tracker: two people editing the same client at once is
 * ordinary, not exotic. The old app compared `updated_at` inside a PostgREST
 * filter and, when the filter matched nothing, told the user "Save failed" —
 * which is both wrong and unactionable, because their edit was fine and the
 * only problem was that they were holding a stale copy.
 *
 * The contract here:
 *
 *   GET     returns `_v`, the row's updated_at as a canonical UTC token.
 *   PATCH   must send `If-Match: <_v>`. No header is 428, not 200 — a write
 *   DELETE  that forgot its precondition is a bug, and silently letting it
 *           through would defeat the whole mechanism.
 *   409     carries `current`: the fresh row. The client re-renders from that
 *           rather than dropping the user back to a reload.
 */

/** Reads and validates If-Match. Throws 428 when absent. */
export function requireIfMatch(req: NextRequest): string {
  const raw = req.headers.get("if-match");

  if (!raw) {
    throw new AppError(
      428,
      "This change needs a version to check against. Reload and try again.",
      { code: "precondition_required" },
    );
  }

  // `*` means "any version" in RFC 9110. Honouring it here would be an
  // opt-out of concurrency control that any client could take by accident,
  // so it is refused explicitly rather than silently accepted.
  if (raw.trim() === "*") {
    throw new AppError(428, "If-Match: * is not accepted on this resource", {
      code: "precondition_required",
    });
  }

  // Strip optional ETag quoting/weak marker so a client that formats the
  // header properly is not punished for it.
  const token = raw.trim().replace(/^W\//, "").replace(/^"|"$/g, "");

  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(token)) {
    throw new AppError(400, "Malformed version token", {
      code: "bad_precondition",
    });
  }

  return token;
}

/**
 * Turns "the UPDATE matched no rows" into the right answer.
 *
 * Zero rows is ambiguous: the row may have moved on (409) or may not exist at
 * all (404). Guessing wrong is user-visible — telling someone their record was
 * deleted when a colleague merely edited it sends them looking for a restore.
 * So the current row is fetched and the two cases are separated.
 *
 * `current` is included in the 409 body so the client can heal in place: show
 * what changed, keep the user's text, let them merge. A bare 409 forces a
 * reload and loses whatever they had typed.
 */
export async function resolveConflict<T>(
  entity: string,
  id: string,
  fetchCurrent: () => Promise<T | null | undefined>,
): Promise<never> {
  const current = await fetchCurrent();

  if (!current) {
    throw notFound(
      `That ${entity} no longer exists — someone deleted it while you were editing.`,
    );
  }

  throw conflict("Someone else changed this while you were editing it.", {
    code: "conflict",
    entity,
    id,
    current,
  });
}

/**
 * Asserts an OCC-guarded statement actually hit its row.
 *
 * Written as a guard rather than left to each call site: an `update ... where
 * updated_at = $v` that matches nothing returns an empty array, not an error,
 * so a missing check reads as a successful save and the user's edit vanishes
 * without a word. That is the single most likely way to reintroduce silent
 * data loss, so it goes through one function.
 */
export async function assertHit<R, C>(
  rows: R[],
  entity: string,
  id: string,
  fetchCurrent: () => Promise<C | null | undefined>,
): Promise<R> {
  if (rows.length) return rows[0];
  return resolveConflict(entity, id, fetchCurrent);
}
