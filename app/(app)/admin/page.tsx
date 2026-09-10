import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { readSessionCookie } from "@/lib/auth/cookies";
import { validateSession } from "@/lib/auth/session";
import { listUsersForAdmin } from "@/lib/db/queries/users";
import { AdminScreen } from "@/components/admin/admin-screen";

/**
 * Admin. Gated HERE, on the server, not by hiding the sidebar link.
 *
 * The link is hidden for non-admins (components/sidebar.tsx), but a hidden
 * link is not a permission — anyone who types the URL arrives.
 *
 * The role comes from validateSession, which reads it fresh from the database
 * rather than from the token, so a demotion takes effect immediately. Note this
 * uses the REAL role: an admin previewing as a viewer keeps the admin screen
 * reachable, because view-as is a preview of what others see, not a way to
 * lock yourself out of the tool you are previewing from.
 */
export default async function AdminPage() {
  // Cookie FIRST. Argument evaluation is left to right, so
  // `validateSession(getDb(), await readSessionCookie())` reaches `getDb()`
  // before the await — the exact hazard the (app) layout documents and avoids.
  // This route only escaped it by inheriting that layout's `force-dynamic`.
  const token = await readSessionCookie();
  const db = getDb();
  const session = await validateSession(db, token);
  if (!session.valid) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  // Only the count is read here — the table itself is a client query so it can
  // refetch after every mutation without a full page round trip.
  const users = await listUsersForAdmin(db);

  return <AdminScreen userCount={users.length} />;
}
