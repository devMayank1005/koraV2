import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage — signed attachment URLs.
 *
 * The bucket is private, so a file is only reachable through a short-lived
 * signed URL. After the migration the database stores ONLY `storagePath`; the
 * URL is generated on every read and never persisted. That is what makes the
 * stored data stable — the old app baked a 4-hour signed URL into the jsonb,
 * so every stored link was expired within a day and only worked because the
 * read path happened to overwrite it.
 *
 * Ported from api/_storage.js, including the bulk-sign call with a per-path
 * fallback: one attachment failing to sign must not blank out the rest.
 */

const BUCKET = "kora-attachments";

/** Matches the old app's 4-hour window; regenerated on every read anyway. */
export const SIGNED_URL_TTL_SECONDS = 4 * 60 * 60;

let cached: SupabaseClient | undefined;

function storage(): SupabaseClient["storage"] {
  if (!cached) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to sign attachment URLs",
      );
    }
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached.storage;
}

/**
 * Signs many paths at once, falling back to individual calls for any the bulk
 * request did not return.
 */
export async function signPaths(
  paths: string[],
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return out;

  const bucket = storage().from(BUCKET);

  try {
    const { data } = await bucket.createSignedUrls(unique, expiresIn);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
    }
  } catch {
    // Fall through to per-path signing below.
  }

  const missing = unique.filter((p) => !out.has(p));
  if (missing.length) {
    await Promise.all(
      missing.map(async (p) => {
        try {
          const { data } = await bucket.createSignedUrl(p, expiresIn);
          if (data?.signedUrl) out.set(p, data.signedUrl);
        } catch {
          // Leave it unsigned; the client renders the filename without a link
          // rather than the whole response failing.
        }
      }),
    );
  }

  return out;
}

/**
 * Collects every `storagePath` anywhere in a nested structure.
 *
 * Located structurally rather than by a fixed schema, mirroring
 * api/_storage.js: attachments appear inside activity entries, edit history
 * and nested edits, across years of records with no single shape.
 */
export function collectStoragePaths(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectStoragePaths(item, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;

  const obj = node as Record<string, unknown>;
  if (typeof obj.storagePath === "string" && obj.storagePath) {
    out.add(obj.storagePath);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collectStoragePaths(value, out);
  }
  return out;
}

/** Adds a fresh `url` beside every `storagePath`, in place. */
export function applySignedUrls(node: unknown, urls: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) applySignedUrls(item, urls);
    return;
  }
  if (!node || typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  if (typeof obj.storagePath === "string") {
    const signed = urls.get(obj.storagePath);
    if (signed) obj.url = signed;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") applySignedUrls(value, urls);
  }
}

/**
 * One call for a whole response: find every path, sign them together, attach.
 *
 * Signing in a single batch matters — a client tree can hold dozens of
 * attachments, and one round trip per file would dominate the response time.
 */
export async function signAttachmentsIn(payload: unknown): Promise<number> {
  const paths = collectStoragePaths(payload);
  if (!paths.size) return 0;
  const urls = await signPaths([...paths]);
  applySignedUrls(payload, urls);
  return urls.size;
}
