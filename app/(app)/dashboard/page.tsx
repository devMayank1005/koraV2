import { getCurrentSession } from "@/lib/auth/current-session";
import { DashboardSwitch } from "@/components/dashboard/switch";

/**
 * There are TWO dashboards, and which one you get is not a permissions
 * variation on one screen — an admin sees the portfolio, everyone else sees
 * their own work. The session is read here, on the server, so the name and role
 * come from the database rather than from anything the browser could set.
 */
export default async function DashboardPage() {
  // Free: the layout already resolved this in the same request, and
  // React.cache returns that same promise rather than querying again.
  const session = await getCurrentSession();

  // The layout has already redirected an invalid session; this is belt and
  // braces so the component below can take a non-null user.
  if (!session.valid) return null;

  return (
    <DashboardSwitch
      role={session.user.role}
      name={session.user.name}
    />
  );
}
