import { IssueLog } from "./issues";

/**
 * Attachment normalization.
 *
 * v1 stored the whole attachment object inside the activity jsonb, including a
 * SIGNED URL that expires after four hours. Those stored URLs are already dead
 * — api/read.js re-signs every one of them on every read, so the persisted
 * value has always been noise.
 *
 * v2 stores only the durable parts: `storagePath` plus metadata. The read path
 * signs a fresh URL from the path. That makes the stored data stable, removes a
 * class of "why is this link broken" bug, and stops expired credentials from
 * sitting in the database indefinitely.
 *
 * `extractStoragePath` is ported from api/_storage.js:20-34 and must keep
 * handling every historical URL shape, since attachments span years of uploads.
 */

const BUCKET = "kora-attachments";

const PATH_PATTERNS = [
  new RegExp(`/storage/v1/object/public/${BUCKET}/([^?]+)`),
  new RegExp(`/storage/v1/object/sign/${BUCKET}/([^?]+)`),
];

/**
 * Recovers the bucket-relative path from a public URL, a signed URL (the path
 * survives even once the signature has expired), or a value that is already a
 * bare path. Returns null for anything else, e.g. a genuine external link.
 */
export function extractStoragePath(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  for (const re of PATH_PATTERNS) {
    const m = value.match(re);
    if (m) return decodeURIComponent(m[1]);
  }

  // Not a URL at all — upload.js falls back to returning a bare path when
  // signing fails at upload time.
  if (!value.includes("://")) return value;

  return null;
}

export interface NormalizedAttachment {
  storagePath: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  [k: string]: unknown;
}

/**
 * Normalizes any object that carries an attachment.
 *
 * Attachments are located structurally — by the presence of a `url` or
 * `storagePath` key — mirroring how api/_storage.js walks the tree, because
 * there is no single schema for where they appear across years of records.
 */
function normalizeOne(
  node: Record<string, unknown>,
  log: IssueLog,
  location: string,
): void {
  const existingPath = node.storagePath;
  const url = node.url;

  let path: string | null =
    typeof existingPath === "string" && existingPath ? existingPath : null;

  if (!path) path = extractStoragePath(url);

  if (!path) {
    // Genuinely unresolvable — keep the object exactly as it is rather than
    // dropping data, and surface it for a human decision.
    log.add("ATTACH_NO_PATH", location, url ?? existingPath);
    return;
  }

  node.storagePath = path;

  if (typeof url === "string") {
    // The stored signed URL is expired noise; the read path re-signs from
    // storagePath. Dropping it keeps stale credentials out of the database.
    delete node.url;
    log.add("ATTACH_URL_STRIPPED", location);
  }
}

/**
 * Walks an activity-log array in place, normalizing every attachment found.
 * Returns the same array so callers can use it inline.
 */
export function normalizeActivityLog<T>(
  entries: T[] | null | undefined,
  log: IssueLog,
  location: string,
): T[] {
  if (!Array.isArray(entries)) return [];

  entries.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") return;
    walk(entry as Record<string, unknown>, log, `${location}[${i}]`);
  });

  return entries;
}

function walk(
  node: Record<string, unknown>,
  log: IssueLog,
  location: string,
): void {
  // An object carrying either key IS an attachment.
  if ("url" in node || "storagePath" in node) {
    normalizeOne(node, log, location);
  }

  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === "object") {
          walk(item as Record<string, unknown>, log, `${location}.${key}[${i}]`);
        }
      });
    } else {
      walk(value as Record<string, unknown>, log, `${location}.${key}`);
    }
  }
}

/** Counts attachments and how many resolved to a path — a verify.ts check. */
export function countAttachments(entries: unknown): {
  total: number;
  withPath: number;
  withUrl: number;
} {
  let total = 0;
  let withPath = 0;
  let withUrl = 0;

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    if ("url" in obj || "storagePath" in obj) {
      total++;
      if (typeof obj.storagePath === "string" && obj.storagePath) withPath++;
      if (typeof obj.url === "string" && obj.url) withUrl++;
    }
    Object.values(obj).forEach(visit);
  };

  visit(entries);
  return { total, withPath, withUrl };
}
