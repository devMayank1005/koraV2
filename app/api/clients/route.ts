import { withAuth, json } from "@/lib/api/handler";
import { listClients, getClientTrees } from "@/lib/db/queries/clients";
import { signAttachmentsIn } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/clients          — list with per-domain counts (the client rails)
 * GET /api/clients?view=tree — every client, fully nested (the dashboard)
 *
 * Two shapes behind one route because they are the same resource at two
 * depths. The rail needs 22 rows and four counts; the dashboard needs all 702
 * phases to compute its aggregates client-side, exactly as the old app did
 * from its single `read` call.
 */
export const GET = withAuth({}, async ({ db, req }) => {
  const view = new URL(req.url).searchParams.get("view");

  if (view === "tree") {
    const clients = await getClientTrees(db);
    // Signed once for the whole payload rather than per client — a tree can
    // carry dozens of attachments and one round trip each would dominate.
    const signed = await signAttachmentsIn(clients);
    return json({ clients, signedAttachments: signed });
  }

  return json({ clients: await listClients(db) });
});
