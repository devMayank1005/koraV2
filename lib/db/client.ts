import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The application's database handle.
 *
 * Connects through Supabase's Supavisor pooler in TRANSACTION mode (6543),
 * which imposes two things:
 *
 *   prepare: false   transaction mode does not support prepared statements
 *   max: 1           one connection per serverless instance; the pooler
 *                    multiplexes, and the free tier's backend pool is small
 *
 * TLS must be stated explicitly. postgres.js does not infer it from the URL,
 * and without it Supabase's pooler rejects the handshake and reports
 * "password authentication failed" — an error that sends you looking for a
 * credential problem that does not exist. That cost real time on this project;
 * do not remove it.
 *
 * Interactive transactions work fine in transaction mode: Supavisor pins the
 * connection for the transaction's duration. Only prepared statements are out.
 */

export type Db = ReturnType<typeof createDb>;

function createDb(url: string) {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: url.includes("localhost") || url.includes("127.0.0.1")
      ? false
      : "require",
    onnotice: () => {},
  });
  return drizzle(sql, { schema });
}

let cached: Db | undefined;

/**
 * Lazily created and reused across warm invocations. Lazy rather than
 * module-scope so that importing anything from this file does not require the
 * environment variable to be present — tests and the build must not need it.
 */
export function getDb(): Db {
  if (cached) return cached;

  // DATABASE_URL only — deliberately NOT falling back to
  // MIGRATION_DATABASE_URL. That variable points at production, and a silent
  // fallback would mean running the app against live data whenever the app's
  // own variable was missing, which is exactly when you least expect it.
  const url = process.env.DATABASE_URL;

  /**
   * A localhost database in a deployed environment is always a mistake.
   *
   * `.env.local` deliberately points DATABASE_URL at a local Postgres, so that
   * building screens never writes to the client data the v1 app is still
   * serving. Copying that file wholesale into a hosting dashboard is the
   * obvious next step and the wrong one — and the symptom is terrible: every
   * route returns a generic 500, and the SSO callback bounces to "sign-in is
   * temporarily unavailable", neither of which mentions the database.
   *
   * Refusing here turns a confusing outage into one sentence naming the cause.
   */
  // NOT during `next build`. A build serves no requests, and failing it would
  // block deploying the /api/health endpoint that diagnoses this exact
  // problem — which is precisely what happened the first time this guard ran.
  // A broken DATABASE_URL should stop a request, loudly, not stop the deploy
  // of the thing that explains why.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (
    url &&
    !isBuild &&
    process.env.NODE_ENV === "production" &&
    /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)
  ) {
    throw new Error(
      "DATABASE_URL points at localhost, but this is a production build.\n" +
        "  A deployed app cannot reach your machine. This is almost always\n" +
        "  .env.local copied verbatim into the hosting environment.\n" +
        "  Use the Supabase TRANSACTION pooler (port 6543) instead.",
    );
  }

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set.\n" +
        "  The app uses the TRANSACTION pooler (port 6543).\n" +
        "  MIGRATION_DATABASE_URL is a separate variable for the migration\n" +
        "  scripts (session pooler, 5432) and is never used as a fallback.",
    );
  }

  cached = createDb(url);
  return cached;
}

export { schema };
