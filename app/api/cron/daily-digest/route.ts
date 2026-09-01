import type { NextRequest } from "next/server";
import { withPublic, json } from "@/lib/api/handler";
import type { Db } from "@/lib/db/client";
import { requireCronAuth, cronActor } from "@/lib/api/cron-auth";
import { runDigest } from "@/lib/digest/run";
import { appUrl } from "@/lib/azure/config";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
// ~20 recipients at 350ms apiece is well under 10s. The ceiling is here so a
// slow mailbox surfaces as a visible timeout rather than a half-sent digest.
export const maxDuration = 300;

/**
 * The daily digest. Vercel Cron calls GET at 03:30 UTC (09:00 IST).
 *
 * POST is the admin "run now" path and accepts `?dryRun=1`, which plans the
 * whole thing and reports who would receive what without sending — the only
 * safe way to check a routing change against real data.
 */
async function run(req: NextRequest, db: Db) {
  const caller = await requireCronAuth(req, db);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const result = await runDigest({ db, appUrl: appUrl(), dryRun });

  if (!dryRun) {
    await logAudit(db, {
      ...cronActor(caller, "Daily digest"),
      entity: "digest",
    });
  }

  return json(result);
}

export const GET = withPublic(({ req, db }) => run(req, db));
export const POST = withPublic(({ req, db }) => run(req, db));
