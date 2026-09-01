import { withAuth, json } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { getClientTree } from "@/lib/db/queries/clients";
import { assertUserId } from "@/lib/auth/account";
import { signAttachmentsIn } from "@/lib/storage";

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
