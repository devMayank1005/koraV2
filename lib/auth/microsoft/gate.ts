import { sql } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import type { AnyDb } from "@/lib/auth/db-types";

/**
 * The never-provision gate.
 *
 * SSO signs people in; it never creates them. A valid Microsoft identity with
 * no matching Kora account is refused at the door — that is the entire point
 * of the feature, and it is what stops anyone in the tenant granting
 * themselves access by clicking a button.
 *
 * Matching is by EMAIL, against `users.email`. Not by username, not by Entra
 * object id — the old app matched on email and the stored data has nothing
 * else to match on.
 */

export type GateResult =
  | { ok: true; user: GateUser }
  | { ok: false; code: "not_authorized" | "sso_ambiguous" | "lookup_failed" };

export interface GateUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  tokenVersion: number;
}

export async function resolveSsoUser(
  db: AnyDb,
  email: string,
): Promise<GateResult> {
  const candidate = email.trim();
  if (!candidate) return { ok: false, code: "not_authorized" };

  let rows: GateUser[];
  try {
    rows = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(
        sql`lower(trim(${users.email})) = lower(trim(${candidate}))
            and ${users.email} <> ''`,
      )
      // TWO, not one. See below.
      .limit(2) as GateUser[];
  } catch {
    // Fail closed: an access-control decision that cannot be made is a denial.
    return { ok: false, code: "lookup_failed" };
  }

  if (rows.length === 0) return { ok: false, code: "not_authorized" };

  // `users.email` has no unique constraint — schema.ts only declares
  // uq_users_username_ci. The old query took `limit=1` from an unordered
  // result, so two accounts sharing an address meant SSO signed you into
  // whichever row Postgres happened to return first, quite possibly the more
  // privileged one. Refusing is the only safe answer, and it is visible:
  // the person gets a distinct message and an admin has something to fix.
  if (rows.length > 1) return { ok: false, code: "sso_ambiguous" };

  return { ok: true, user: rows[0] };
}
