import { withAuth, json } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/mutate";
import { clientEmailSend } from "@/lib/validation/entities";
import { sendClientEmail } from "@/lib/mail/client-email";

export const runtime = "nodejs";

/**
 * POST /api/client-email — editor and above.
 *
 * Rate-limited per user and globally; the mailbox is shared, so one account
 * must not be able to spend everyone's standing with it.
 */
export const POST = withAuth({ role: "editor" }, async (ctx) => {
  const input = await parseBody(ctx.req, clientEmailSend);
  const result = await sendClientEmail(ctx.db, ctx.user, input, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return json(result);
});
