import { getDb } from "@/lib/db/client";
import { readSessionCookie } from "@/lib/auth/cookies";
import { validateSession } from "@/lib/auth/session";
import { DashboardSwitch } from "@/components/dashboard/switch";

/**
 * There are TWO dashboards, and which one you get is not a permissions
 * variation on one screen — an admin sees the portfolio, everyone else sees
 * their own work. The session is read here, on the server, so the name and role
 * come from the database rather than from anything the browser could set.
 */
export default async function DashboardPage() {
  // Cookie FIRST, then the database handle — the same ordering the layout
  // documents at length. `validateSession(getDb(), await readSessionCookie())`
  // evaluates `getDb()` before the await, which is what made this route look
  // statically analysable to Next.
  const token = await readSessionCookie();
  const session = await validateSession(getDb(), token);

  // The layout has already redirected an invalid session; this is belt and
  // braces so the component below can take a non-null user. It costs one more
  // `users` lookup per dashboard load — kept deliberately, because the
  // alternative is a non-null assertion on a value the type system cannot
  // prove, and the query is a single indexed read.
  if (!session.valid) return null;

  return (
    <DashboardSwitch
      role={session.user.role}
      name={session.user.name}
    />
  );
}
