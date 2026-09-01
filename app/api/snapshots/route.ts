import { withAuth, json } from "@/lib/api/handler";
import { listSnapshots } from "@/lib/db/queries/misc";

export const runtime = "nodejs";

export const GET = withAuth({}, async ({ db, user, req }) => {
  const p = new URL(req.url).searchParams;
  const rows = await listSnapshots(db, {
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    clientId: p.get("clientId") ?? undefined,
    // Billable hours are omitted entirely for non-admins.
    isAdmin: user.role === "admin",
  });
  return json({ rows });
});
