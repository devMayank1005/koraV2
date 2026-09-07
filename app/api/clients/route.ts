import { withAuth, json } from "@/lib/api/handler";
import { forbidden } from "@/lib/api/errors";
import {
  listClients,
  getClientTrees,
  listArchivedClients,
} from "@/lib/db/queries/clients";
import { createClient } from "@/lib/db/mutations/clients";
import { clientCreate } from "@/lib/validation/entities";
import { created } from "@/lib/api/mutate";
import { signAttachmentsIn } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/clients            — list with per-domain counts (the client rails)
 * GET /api/clients?view=tree   — every client, fully nested (the dashboard)
 * GET /api/clients?archived=1  — the archived list, ADMIN ONLY
 *
 * Two shapes behind one route because they are the same resource at two
 * depths. The rail needs 22 rows and four counts; the dashboard needs all 702
 * phases to compute its aggregates client-side, exactly as the old app did
 * from its single `read` call.
 */
export const GET = withAuth({}, async ({ db, user, req }) => {
  const params = new URL(req.url).searchParams;
  const view = params.get("view");

  // Admin-gated inside the handler rather than by splitting the route: the
  // archived list is the same resource with the filter inverted, and a
  // separate path would duplicate the auth wiring for one boolean.
  if (params.get("archived") === "1") {
    if (user.role !== "admin") throw forbidden();
    return json({ clients: await listArchivedClients(db) });
  }

  if (view === "tree") {
    const clients = await getClientTrees(db);
    // Signed once for the whole payload rather than per client — a tree can
    // carry dozens of attachments and one round trip each would dominate.
    const signed = await signAttachmentsIn(clients);
    return json({ clients, signedAttachments: signed });
  }

  return json({ clients: await listClients(db) });
});

/** POST /api/clients — create. Editors and above. */
export const POST = withAuth({ role: "editor" }, (ctx) =>
  created(ctx, clientCreate, "Create client", "clients", (input) =>
    createClient(ctx.db, input),
  ),
);
