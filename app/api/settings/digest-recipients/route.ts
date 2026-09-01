import { withAuth, json } from "@/lib/api/handler";
import { getDigestRecipients } from "@/lib/db/queries/misc";

export const runtime = "nodejs";

/**
 * ADMIN ONLY — this is the fix for a real gap.
 *
 * The old endpoint had no role check, so any viewer could read the internal
 * distribution list: a list of colleagues' email addresses, served to anyone
 * with an account.
 */
export const GET = withAuth({ role: "admin" }, async ({ db }) =>
  json({ digestRecipients: await getDigestRecipients(db) }),
);
