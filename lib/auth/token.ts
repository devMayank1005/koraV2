import crypto from "node:crypto";

/**
 * Session tokens.
 *
 * Ported from api/_auth.js. Format is `base64url(JSON payload).hexHMAC`, not a
 * JWT — there is no header segment and no `alg` field, which sidesteps the
 * algorithm-confusion class of attack entirely because there is nothing to
 * negotiate. The secret is symmetric and server-only.
 *
 * The old app carried this in an `x-session-token` header out of localStorage.
 * We keep the format and move the transport to an httpOnly cookie, so a script
 * injected into the page can no longer read it.
 */

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
  /** Bumped to revoke every token a user holds. */
  tokenVersion: number;
  /** Epoch ms. */
  iat: number;
  exp: number;
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function signToken(payload: TokenPayload, secret: string): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

/**
 * Verifies the signature and returns the payload, or null.
 *
 * THE HEX PRE-CHECK IS LOad-BEARING. `timingSafeEqual` throws a RangeError on
 * buffers of unequal length, and `Buffer.from(sig, "hex")` silently produces a
 * short buffer for any non-hex input. Without the regex, sending a garbage
 * token threw an uncaught error inside every endpoint — an unauthenticated
 * caller could trigger a 500 on demand. This was a real bug in the original
 * (fixed there as "M-4"); it is kept here because the failure is completely
 * silent until someone probes for it.
 */
export function verifyToken(
  token: string | undefined | null,
  secret: string | undefined | null,
): TokenPayload | null {
  if (!token || !secret) return null;

  // The payload is base64url and contains no dots, so the last one separates
  // it from the signature.
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!/^[0-9a-f]{64}$/i.test(sig)) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString(),
    ) as TokenPayload;
    // A signed but structurally wrong payload should fail closed rather than
    // flow onward as `undefined` fields.
    if (
      typeof parsed?.id !== "string" ||
      typeof parsed?.username !== "string" ||
      typeof parsed?.exp !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isExpired(payload: TokenPayload, now = Date.now()): boolean {
  return typeof payload.exp === "number" && now > payload.exp;
}

/** Builds a 7-day payload. `iat`/`exp` are injectable so tests can freeze time. */
export function buildPayload(
  user: { id: string; username: string; role: string; tokenVersion?: number },
  now = Date.now(),
): TokenPayload {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
    iat: now,
    exp: now + SEVEN_DAYS_MS,
  };
}
