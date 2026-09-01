import { asc } from "drizzle-orm";
import { vToken } from "@/lib/db/occ";
import { users } from "@/lib/db/schema";
import type { AnyDb } from "@/lib/auth/db-types";

/**
 * User reads, shaped by the caller's role.
 *
 * Two shapes exist because everyone needs the name list — assignee dropdowns
 * appear on every domain screen — but only an admin should see lockout state
 * and email addresses.
 *
 * `passwordHash` is never selected. Not filtered afterwards: never selected,
 * so there is no code path where a refactor could let it slip into a response.
 */

export interface UserOption {
  id: string;
  username: string;
  name: string;
  role: string;
}

export interface UserAdminView extends UserOption {
  email: string;
  createdAt: string | null;
  lockedUntil: string | null;
  failedAttempts: number;
  lockoutLevel: number;
  _v: string | null;
}

export async function listUsersForDropdown(db: AnyDb): Promise<UserOption[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .orderBy(asc(users.username));
  return rows;
}

export async function listUsersForAdmin(db: AnyDb): Promise<UserAdminView[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      email: users.email,
      createdAt: users.createdAt,
      lockedUntil: users.lockedUntil,
      failedAttempts: users.failedAttempts,
      lockoutLevel: users.lockoutLevel,
      _v: vToken(users.updatedAt),
    })
    .from(users)
    .orderBy(asc(users.username));

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    email: r.email ?? "",
    createdAt: r.createdAt,
    lockedUntil: r.lockedUntil,
    failedAttempts: r.failedAttempts,
    lockoutLevel: r.lockoutLevel,
    _v: r._v,
  }));
}

/** Single entry point, so a route cannot pick the wrong shape by accident. */
export async function listUsers(
  db: AnyDb,
  role: string,
): Promise<UserOption[] | UserAdminView[]> {
  return role === "admin" ? listUsersForAdmin(db) : listUsersForDropdown(db);
}
