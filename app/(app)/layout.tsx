import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { readSessionCookie } from "@/lib/auth/cookies";
import { validateSession } from "@/lib/auth/session";
import { AppChrome } from "@/components/app-chrome";

/**
 * The authenticated shell.
 *
 * The session is validated HERE, on the server, not in proxy.ts. The proxy
 * checks a signature and an expiry so an unauthenticated visitor lands on
 * /login rather than on a shell that flashes and bounces — but it does not
 * touch the database, so it cannot know the session was revoked or the role
 * changed. This does the full check, and every API route does it again.
 *
 * That means the role driving the sidebar is always the DATABASE's role, never
 * the one baked into the token. A demotion takes effect on the next page load
 * rather than in seven days when the token expires.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await validateSession(getDb(), await readSessionCookie());

  if (!session.valid) {
    // The proxy normally catches this first; reaching here means the session
    // was revoked between the proxy's signature check and now.
    redirect("/login");
  }

  return (
    <AppChrome
      user={{
        name: session.user.name,
        username: session.user.username,
        role: session.user.role,
      }}
    >
      {children}
    </AppChrome>
  );
}
