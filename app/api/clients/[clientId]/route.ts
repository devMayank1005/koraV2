import { withAuth, json } from "@/lib/api/handler";
import { updateClient, archiveClient } from "@/lib/db/mutations/clients";
import { clientUpdate } from "@/lib/validation/entities";
import { updated, removed } from "@/lib/api/mutate";
import { notFound } from "@/lib/api/errors";
import { getClientTree } from "@/lib/db/queries/clients";
import { assertUserId } from "@/lib/auth/account";
import { signAttachmentsIn } from "@/lib/storage";

import { actorName } from "@/lib/api/actor";

export const runtime = "nodejs";

export const GET = withAuth<{ clientId: string }>(
  {},
  async ({ db, params }) => {
    // Same id format as everything else; validated before it reaches a query.
    const id = assertUserId(params.clientId);

    const client = await getClientTree(db, id);
    if (!client) throw notFound("Client not found");

    await signAttachmentsIn(client);
    return json({ client });
  },
);

/** PATCH /api/clients/[clientId] — partial update under If-Match. */
export const PATCH = withAuth<{ clientId: string }>(
  { role: "editor" },
  (ctx) =>
    updated(ctx, clientUpdate, "Update client", "clients", (input, token) =>
      updateClient(ctx.db, ctx.params.clientId, token, input),
    ),
);

/**
 * DELETE /api/clients/[clientId] — soft delete, cascading to every child.
 *
 * Admin only. Archiving a client hides its whole delivery history at once,
 * which is a different weight of action from editing a field, and the old app
 * let any editor do it with no version check at all.
 */
export const DELETE = withAuth<{ clientId: string }>(
  { role: "admin" },
  (ctx) =>
    removed(ctx, "Archive client", "clients", (token) =>
      archiveClient(ctx.db, ctx.params.clientId, token, actorName(ctx)),
    ),
);
