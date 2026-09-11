"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useClientList } from "@/lib/query/hooks";
import { useUi, useUiHydrated } from "@/lib/store/ui";
import { pickLanding } from "@/lib/domain/integrations";
import { PageSkeleton } from "@/components/ui/page-skeleton";

/**
 * The same width the client rail appears at — `hidden md:flex` in
 * tracker-shell.tsx. Below it there is no rail, so the index behind this is the
 * only way to pick a client and must not be skipped.
 */
const RAIL_QUERY = "(min-width: 768px)";

const mql = () => window.matchMedia(RAIL_QUERY);

function subscribe(onChange: () => void): () => void {
  const m = mql();
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

const hasRail = () => mql().matches;

/**
 * Assume the rail is there while rendering on the server.
 *
 * `matchMedia` does not exist there, and this has to return something. Assuming
 * the desktop means the server emits the skeleton — which is what the redirect
 * path wants and what `loading.tsx` was already showing, so the hand-off is
 * invisible. A phone corrects it on the first client render and gets the index.
 * Assuming the opposite would flash a grid of 26 clients at every desktop user
 * on the way past.
 */
const hasRailServer = () => true;

/**
 * `/integrations` with no client chosen: go to one instead of asking.
 *
 * The index behind this is a grid of every client, and on a desktop it sits
 * next to a rail listing exactly the same clients. Picking from two identical
 * lists is not a choice, it is a step — so this skips it and opens the client
 * you were last in, or the first one.
 *
 * THE INDEX IS NOT DEAD, which is why this cannot be a server redirect. Below
 * 768px the rail is hidden, so the index is the only way to pick a client at
 * all; a `redirect()` in the page would strand a phone on one client, and the
 * breadcrumb back to `/integrations` would just redirect again. The decision
 * needs the viewport, the viewport is not knowable on the server, so it is made
 * here — and read through `useSyncExternalStore` rather than mirrored into
 * state by an effect, the same treatment the theme class gets.
 *
 * This is the only effect-driven navigation in the app. It is deliberate and
 * narrow: one route, one condition, and `replace` rather than `push` so Back
 * goes where you came from instead of bouncing off the redirect.
 */
export function IntegrationsLanding({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const query = useClientList();
  const remembered = useUi((s) => s.lastIntegrationsClient);
  const storeReady = useUiHydrated();
  const railVisible = useSyncExternalStore(subscribe, hasRail, hasRailServer);

  // The rail's own query, already hydrated by the layout — so this costs no
  // request and the ids are here on the first render.
  const ids = useMemo(() => (query.data ?? []).map((c) => c.id), [query.data]);
  const target = pickLanding(remembered, ids);

  /**
   * Both gates matter, and the second one cost an afternoon.
   *
   * `query.isPending` — redirecting to `undefined` lands on a 404, and showing
   * the index only to yank it away is worse than one more frame of skeleton.
   *
   * `storeReady` — `persist` rehydrates AFTER the first render, so without it
   * this reads "nothing remembered", redirects to the first client, is then
   * handed the real answer and redirects again. Two `router.replace` calls
   * racing each other, and the screen sits on a skeleton. A redirect is not a
   * decision you can take twice.
   */
  const redirecting =
    !query.isPending && storeReady && railVisible && Boolean(target);

  useEffect(() => {
    if (redirecting && target) {
      router.replace(`/integrations/${encodeURIComponent(target)}`);
    }
  }, [redirecting, target, router]);

  if (query.isPending || !storeReady || redirecting) {
    return <PageSkeleton shape="cards" rows={9} />;
  }

  return <>{children}</>;
}
