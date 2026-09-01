import { NextResponse } from "next/server";
import { withPublic } from "@/lib/api/handler";
import { azureApp, authorizeUrl, ssoRedirectUri, appUrl } from "@/lib/azure/config";
import { createVerifier, challengeFor, newNonce } from "@/lib/auth/microsoft/pkce";
import {
  signState, setSsoCookie, safeNext, SSO_STATE_TTL_MS,
} from "@/lib/auth/microsoft/state";
import { SSO_SCOPE } from "@/lib/auth/microsoft/exchange";

export const runtime = "nodejs";

const bounce = (code: string) =>
  NextResponse.redirect(`${appUrl()}/login?ssoError=${encodeURIComponent(code)}`);

/**
 * GET /api/auth/microsoft/start — begins the sign-in.
 *
 * Redirects are issued with NextResponse.redirect rather than `redirect()`
 * from next/navigation. `redirect()` works by throwing, and withPublic's
 * catch-all would turn that throw into a JSON 500 with a correlation id.
 */
export const GET = withPublic(async ({ req }) => {
  const creds = azureApp();
  const secret = process.env.INTEGTRACK_SECRET;
  if (!creds || !secret) return bounce("not_configured");

  const verifier = createVerifier();
  const nonce = newNonce();
  const now = Date.now();

  // The verifier and the destination stay server-side in an httpOnly cookie;
  // only the nonce travels through the URL.
  await setSsoCookie(
    signState(
      {
        purpose: "msftAuthState",
        nonce,
        verifier,
        next: safeNext(new URL(req.url).searchParams.get("next")),
        iat: now,
        exp: now + SSO_STATE_TTL_MS,
      },
      secret,
    ),
  );

  const url = new URL(authorizeUrl(creds.tenantId));
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ssoRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SSO_SCOPE);
  url.searchParams.set("state", nonce);
  url.searchParams.set("code_challenge", challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  // Without this, a shared machine silently reuses whichever Entra session is
  // cached, and the "not registered in Kora" bounce becomes baffling — the
  // person never saw an account picker, so they cannot tell which account was
  // tried. One extra click buys a comprehensible failure.
  url.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(url.toString());
});
