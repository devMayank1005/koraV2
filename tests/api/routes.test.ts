import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { AnyDb } from "@/lib/auth/db-types";

/**
 * ROUTE-LEVEL tests — the layer nothing else touches.
 *
 * Every other suite tests one layer below the HTTP boundary: it calls
 * `listSnapshots(db, { isAdmin: false })` directly, or `requireIfMatch(req)` in
 * isolation. Those prove the pieces work. They cannot prove the ROUTES wire
 * them up, and two of this project's properties live only at that layer:
 *
 *   "digest-recipients is admin-only"
 *   "every PATCH and DELETE requires If-Match"
 *
 * Both were true by reading and untested — and an audit found four PATCH and
 * DELETE handlers that had no If-Match at all, precisely because nothing here
 * existed to catch it. A test that would have failed is worth more than a
 * comment that was accurate.
 *
 * These import the real `route.ts` files and invoke the exported handlers, so
 * a route that drops its role gate, forgets its precondition, or calls the
 * wrong mutation fails here.
 */

const MIGRATIONS = path.resolve(process.cwd(), "db/migrations");
const readSql = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");

let pg: PGlite;
let db: AnyDb;

/** Swapped per test to impersonate a role. */
let sessionToken: string | null = null;

// The route handlers reach for the app's singleton and for request-scoped
// cookies; neither exists in a test process, so both are replaced. Everything
// else — withAuth, the role ranking, requireIfMatch, the mutations — is real.
// vi.fn rather than a plain arrow, so a test can make the handle throw and
// assert that routes which never query still work.
vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => db),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name.includes("kora_session") && sessionToken
        ? { name, value: sessionToken }
        : undefined,
    set: () => {},
  }),
}));

const { GET: getDigestRecipients, PUT: putDigestRecipients } = await import(
  "@/app/api/settings/digest-recipients/route"
);
const { GET: getAudit } = await import("@/app/api/audit/route");
const { GET: getSnapshots, POST: postSnapshot } = await import(
  "@/app/api/snapshots/route"
);
const { GET: getClients, POST: postClient } = await import("@/app/api/clients/route");
const { PATCH: patchClient, DELETE: deleteClient } = await import(
  "@/app/api/clients/[clientId]/route"
);
const { PATCH: patchIntegration } = await import(
  "@/app/api/integrations/[integrationId]/route"
);

const { signToken, buildPayload } = await import("@/lib/auth/token");
const { clients, users } = await import("@/lib/db/schema");

const SECRET = "route-test-secret";

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema }) as unknown as AnyDb;
  await pg.exec(`do $$ begin
    if not exists (select from pg_roles where rolname='service_role') then
      create role service_role;
    end if; end $$;`);
  for (const f of [
    "0001_baseline_v1_schema.sql", "0002_v2_schema.sql",
    "0003_domain_membership.sql", "0004_client_name_ci_unique.sql",
    "0005_backend_indexes.sql", "0006_updated_at_trigger.sql",
  ]) {
    await pg.exec(readSql(f));
  }
}, 60_000);

beforeEach(async () => {
  await pg.exec(
    `truncate table phases_v2, modules_v2, milestones_v2, integrations_v2,
     ams_work_log_v2, clients_v2, users, app_settings, audit_log,
     portfolio_snapshots restart identity cascade`,
  );
  vi.stubEnv("INTEGTRACK_SECRET", SECRET);

  // Undo any mockImplementationOnce a previous test installed.
  // Cast at the seam: the tests run PGlite, getDb is typed for postgres-js.
  // Same substitution the whole suite already relies on, now made explicit
  // because vi.mocked gives the factory a real type.
  const { getDb } = await import("@/lib/db/client");
  vi.mocked(getDb).mockImplementation(() => db as unknown as ReturnType<typeof getDb>);

  await db.insert(users).values([
    { id: "u_admin", username: "meera", name: "Meera", email: "m@x.com",
      role: "admin", passwordHash: "$2b$12$x", tokenVersion: 0 },
    { id: "u_editor", username: "arjun", name: "Arjun", email: "a@x.com",
      role: "editor", passwordHash: "$2b$12$x", tokenVersion: 0 },
    { id: "u_viewer", username: "vikram", name: "Vikram", email: "v@x.com",
      role: "viewer", passwordHash: "$2b$12$x", tokenVersion: 0 },
  ]);
  signInAs("admin");
});

afterAll(async () => {
  await pg?.close();
});

function signInAs(role: "admin" | "editor" | "viewer" | null) {
  if (!role) {
    sessionToken = null;
    return;
  }
  const id = `u_${role}`;
  const username = { admin: "meera", editor: "arjun", viewer: "vikram" }[role];
  sessionToken = signToken(buildPayload({ id, username, role }), SECRET);
}

/** A request that looks like it came from our own page. */
function req(
  url: string,
  init: { method?: string; body?: unknown; ifMatch?: string } = {},
) {
  const headers: Record<string, string> = { "sec-fetch-site": "same-origin" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.ifMatch) headers["if-match"] = init.ifMatch;

  return new NextRequest(`https://kora.test${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});

/* ============================================================ role gates */

describe("role gates, at the route", () => {
  it("refuses a viewer the digest recipient list", async () => {
    // The real leak in the old app: `ops?op=settings` had no role check and
    // handed any viewer the internal distribution list. Asserted here at the
    // route, not by calling the query function with isAdmin: false.
    signInAs("viewer");
    expect((await getDigestRecipients(req("/api/settings/digest-recipients"))).status)
      .toBe(403);

    signInAs("editor");
    expect((await getDigestRecipients(req("/api/settings/digest-recipients"))).status)
      .toBe(403);

    signInAs("admin");
    expect((await getDigestRecipients(req("/api/settings/digest-recipients"))).status)
      .toBe(200);
  });

  it("refuses a non-admin the audit log", async () => {
    signInAs("viewer");
    expect((await getAudit(req("/api/audit"))).status).toBe(403);
    signInAs("admin");
    expect((await getAudit(req("/api/audit"))).status).toBe(200);
  });

  it("refuses a viewer any write", async () => {
    signInAs("viewer");
    const res = await postClient(req("/api/clients", { method: "POST", body: { name: "X" } }));
    expect(res.status).toBe(403);
  });

  it("refuses everyone when there is no session at all", async () => {
    signInAs(null);
    expect((await getClients(req("/api/clients"))).status).toBe(401);
  });

  it("takes the role from the DATABASE, not the token", async () => {
    // A token minted while someone was an admin must stop working the moment
    // the row says otherwise — that is the whole point of re-reading it.
    sessionToken = signToken(
      buildPayload({ id: "u_viewer", username: "vikram", role: "admin" }),
      SECRET,
    );
    expect((await getAudit(req("/api/audit"))).status).toBe(403);
  });

  it("strips ams_hours_month from a snapshot read for a non-admin", async () => {
    await db.insert(clients).values({ id: "c1", name: "Aster", hasAms: true });
    signInAs("admin");
    await postSnapshot(req("/api/snapshots", { method: "POST" }));

    signInAs("viewer");
    const body = await (await getSnapshots(req("/api/snapshots"))).json();
    expect(body.snapshots ?? body).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("amsHoursMonth");

    signInAs("admin");
    const asAdmin = await (await getSnapshots(req("/api/snapshots"))).json();
    expect(JSON.stringify(asAdmin)).toContain("amsHoursMonth");
  });
});

/* ====================================================== the If-Match rule */

describe("If-Match, at the route", () => {
  async function makeClient(): Promise<{ id: string; v: string }> {
    signInAs("editor");
    const res = await postClient(
      req("/api/clients", { method: "POST", body: { name: "Aster Retail" } }),
    );
    const body = await res.json();
    return { id: body.id, v: body._v };
  }

  it("rejects a PATCH with no If-Match as 428, not 200", async () => {
    // A write that forgot its precondition is a bug. Letting it through
    // silently defeats the entire concurrency mechanism.
    const c = await makeClient();
    const res = await patchClient(
      req(`/api/clients/${c.id}`, { method: "PATCH", body: { description: "x" } }),
      ctx({ clientId: c.id }),
    );
    expect(res.status).toBe(428);
  });

  it("rejects a DELETE with no If-Match as 428", async () => {
    const c = await makeClient();
    signInAs("admin");
    const res = await deleteClient(
      req(`/api/clients/${c.id}`, { method: "DELETE" }),
      ctx({ clientId: c.id }),
    );
    expect(res.status).toBe(428);
  });

  it("accepts a PATCH carrying the current token", async () => {
    const c = await makeClient();
    const res = await patchClient(
      req(`/api/clients/${c.id}`, {
        method: "PATCH", body: { description: "SAP" }, ifMatch: c.v,
      }),
      ctx({ clientId: c.id }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 with the current row for a stale token", async () => {
    const c = await makeClient();
    await patchClient(
      req(`/api/clients/${c.id}`, {
        method: "PATCH", body: { description: "theirs" }, ifMatch: c.v,
      }),
      ctx({ clientId: c.id }),
    );

    const res = await patchClient(
      req(`/api/clients/${c.id}`, {
        method: "PATCH", body: { description: "mine" }, ifMatch: c.v,
      }),
      ctx({ clientId: c.id }),
    );
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.code).toBe("conflict");
    expect(body.current.description).toBe("theirs");
  });

  it("rejects a malformed token as 400, not 500", async () => {
    const c = await makeClient();
    const res = await patchClient(
      req(`/api/clients/${c.id}`, {
        method: "PATCH", body: { description: "x" }, ifMatch: "not-a-date",
      }),
      ctx({ clientId: c.id }),
    );
    expect(res.status).toBe(400);
  });

  it("applies the same rule to a nested resource", async () => {
    // Spot-check that the rule is not just on /api/clients.
    const res = await patchIntegration(
      req("/api/integrations/nope", { method: "PATCH", body: { name: "x" } }),
      ctx({ integrationId: "nope" }),
    );
    expect(res.status).toBe(428);
  });
});

/* ================================================== request-shape errors */

describe("request handling", () => {
  it("rejects an unknown field rather than dropping it", async () => {
    signInAs("editor");
    const res = await postClient(
      req("/api/clients", { method: "POST", body: { name: "X", nonsense: 1 } }),
    );
    expect(res.status).toBe(400);
  });

  it("turns a duplicate name into a usable 409, not a 500", async () => {
    signInAs("editor");
    await postClient(req("/api/clients", { method: "POST", body: { name: "Aster" } }));
    const res = await postClient(
      req("/api/clients", { method: "POST", body: { name: "  aster  " } }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("already exists");
  });

  it("blocks a cross-site write even with a valid session", async () => {
    signInAs("admin");
    const r = new NextRequest("https://kora.test/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ name: "X" }),
    });
    expect((await postClient(r)).status).toBe(403);
  });

  it("writes an audit row for a write, naming the actor", async () => {
    signInAs("editor");
    await postClient(req("/api/clients", { method: "POST", body: { name: "Audited" } }));

    const rows = await db.select().from(schema.auditLog);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.username === "arjun")).toBe(true);
  });

  it("PUT on settings is admin-only", async () => {
    signInAs("editor");
    const res = await putDigestRecipients(
      req("/api/settings/digest-recipients", {
        method: "PUT", body: { emails: ["a@b.com"] },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("deployment misconfiguration is caught, not hidden", () => {
  /**
   * The mistake this exists for, which took two rounds to diagnose:
   * `.env.local` deliberately points DATABASE_URL at a local Postgres so that
   * building screens never touches live client data. Copying that file
   * verbatim into Vercel is the obvious next step and the wrong one — and the
   * symptom is every route returning a generic 500 while the SSO callback
   * bounces to "sign-in is temporarily unavailable". Neither mentions the
   * database, or the URL, or the environment.
   */
  const LOCALHOST_URLS = [
    "postgresql://mayank@localhost:5432/kora_dev",
    "postgresql://u:p@127.0.0.1:5432/db",
    "postgresql://u:p@[::1]:5432/db",
  ];

  const looksLocal = (url: string) =>
    /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

  it("recognises every spelling of a local database", () => {
    for (const url of LOCALHOST_URLS) {
      expect(looksLocal(url)).toBe(true);
    }
  });

  it("does not mistake a real host for a local one", () => {
    // The pooler hostname must never trip this, or production refuses to boot.
    for (const url of [
      "postgresql://postgres.ref:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres",
      "postgresql://u:p@db.example.com:5432/x",
      // Contains the word but is not the host.
      "postgresql://u:p@localhost.example.com:5432/x",
    ]) {
      expect(looksLocal(url)).toBe(false);
    }
  });

  it("health reports the localhost database rather than just failing", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://mayank@localhost:5432/kora_dev");
    vi.stubEnv("KORA_APP_URL", "http://localhost:3000");

    const { GET: health } = await import("@/app/api/health/route");
    const body = await (await health()).json();

    expect(body.checks.database).toContain("LOCALHOST");
    expect(body.checks.appUrl).toContain("LOCALHOST");
    expect(body.ok).toBe(false);
  });
});

describe("authenticated pages are never prerendered", () => {
  /**
   * `/ams` was statically prerendered, which ran the (app) layout during
   * `next build` and hit the database from a build machine. It only surfaced
   * because a guard happened to throw there; without it the build would have
   * quietly produced an HTML snapshot of a signed-out shell and served it to
   * everyone.
   *
   * `cookies()` marks a route dynamic, but only once CALLED — and argument
   * evaluation is left to right, so `validateSession(getDb(), await
   * readSessionCookie())` reached the database first. Two defences now: the
   * cookie is read before the handle is asked for, and the layout says so
   * explicitly. This asserts the explicit one, because the ordering is the
   * kind of thing a refactor undoes without noticing.
   */
  it("the (app) layout opts out of static rendering", async () => {
    const layout = await import("@/app/(app)/layout");
    expect(layout.dynamic).toBe("force-dynamic");
  });

  it("reads the session cookie before asking for a database handle", () => {
    // Belt and braces on the ordering that caused it. Scoped to the FUNCTION
    // BODY — a first version searched the whole file and matched the import on
    // line 2 and the explanatory comment on line 29, so it failed while the
    // code was correct.
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "app/(app)/layout.tsx"),
      "utf8",
    );
    const body = src.slice(src.indexOf("export default async function AppLayout"));

    const cookieAt = body.indexOf("readSessionCookie()");
    const dbAt = body.indexOf("getDb()");
    expect(cookieAt).toBeGreaterThan(-1);
    expect(dbAt).toBeGreaterThan(-1);
    expect(cookieAt).toBeLessThan(dbAt);
  });
});

describe("a route fails on the dependencies it actually uses", () => {
  /**
   * `withPublic` built a database handle for every route eagerly. With a
   * misconfigured DATABASE_URL that made `/api/auth/microsoft/start` — a pure
   * redirect that issues no query — return an opaque 500 alongside everything
   * else, which is a confusing signal when you are trying to work out what is
   * actually broken.
   */
  it("SSO start works even when the database is unreachable", async () => {
    vi.stubEnv("AZURE_CLIENT_ID", "id");
    vi.stubEnv("AZURE_CLIENT_SECRET", "secret");
    vi.stubEnv("AZURE_TENANT_ID", "tenant");
    vi.stubEnv("KORA_APP_URL", "https://kora.test");

    // Any access to the handle throws, standing in for an unreachable server.
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error("database unreachable");
    });

    const { GET: ssoStart } = await import("@/app/api/auth/microsoft/start/route");
    const res = await ssoStart(
      new NextRequest("https://kora.test/api/auth/microsoft/start", {
        headers: { host: "kora.test" },
      }),
    );

    // A redirect to Microsoft, not a 500.
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("login.microsoftonline.com");
  });
});
