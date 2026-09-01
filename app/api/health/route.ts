import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — is this deployment actually wired up?
 *
 * Public, because the moment you need it is the moment you cannot sign in. A
 * misconfigured DATABASE_URL made every route fail with a generic 500 and the
 * SSO callback bounce to "temporarily unavailable"; working out that the
 * database was unreachable meant probing the login endpoint from outside and
 * inferring it from the status code.
 *
 * It reports whether each dependency ANSWERS — never a hostname, a database
 * name, a key, or a driver message. "Configured" means the variable is
 * non-empty, which is the failure that actually happens; nothing here can be
 * used to enumerate anything.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  const t0 = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    checks.database = `ok (${Date.now() - t0}ms)`;
  } catch {
    // Deliberately not the driver's message: it names hosts and users.
    checks.database = "unreachable";
  }

  const present = (name: string) =>
    (process.env[name] ?? "").trim() ? "configured" : "MISSING";

  checks.sessionSecret = present("INTEGTRACK_SECRET");
  checks.appUrl = present("KORA_APP_URL");
  checks.storage = present("SUPABASE_SERVICE_ROLE_KEY");
  checks.cron = present("CRON_SECRET");
  checks.sso =
    present("AZURE_CLIENT_ID") === "configured" &&
    present("AZURE_CLIENT_SECRET") === "configured" &&
    present("AZURE_TENANT_ID") === "configured"
      ? "configured"
      : "MISSING";
  checks.mailSender = present("AZURE_DEFAULT_MAIL_SENDER");

  const healthy =
    checks.database.startsWith("ok") &&
    !Object.values(checks).includes("MISSING");

  return NextResponse.json(
    { ok: healthy, checks },
    { status: healthy ? 200 : 503 },
  );
}
