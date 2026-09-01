import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { readSessionCookie } from "@/lib/auth/cookies";
import { validateSession } from "@/lib/auth/session";

/**
 * Admin. Gated HERE, on the server, not by hiding the sidebar link.
 *
 * The link is hidden for non-admins (components/sidebar.tsx), but a hidden
 * link is not a permission — anyone who types the URL arrives. The page is
 * empty today, so nothing leaks yet; the check goes in now because "we will
 * add it when there is something to protect" is how it gets forgotten.
 *
 * The role comes from validateSession, which reads it fresh from the database
 * rather than from the token, so a demotion takes effect immediately.
 */
export default async function AdminPage() {
  const session = await validateSession(getDb(), await readSessionCookie());
  if (!session.valid) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  return <div className="p-7 text-k-ink">Admin</div>;
}
