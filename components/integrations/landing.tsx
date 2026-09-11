"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useClientList } from "@/lib/query/hooks";
import { useUi } from "@/lib/store/ui";
import { pickLanding, inIntegrationsTracker } from "@/lib/domain/integrations";
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
  const railVisible = useSyncExternalStore(subscribe, hasRail, hasRailServer);

  /**
   * The rail's own query, already hydrated by the layout — so this costs no
   * request and the ids are here on the first render.
   *
   * FILTERED THE SAME WAY THE RAIL IS. Without it this redirects to whatever is
   * alphabetically first, which here is a client with no integrations at all —
   * landing you on an empty screen that the rail beside it refuses to list. A
   * remembered client whose integrations have since been archived falls through
   * to the first that has work, which is the same rule and the right answer.
   */
  const ids = useMemo(
    () =>
      (query.data ?? [])
        .filter((c) => inIntegrationsTracker(c.counts.integrations))
        .map((c) => c.id),
    [query.data],
  );
  /**
   * THE REMEMBERED CLIENT IS READ IN THE EFFECT, not subscribed to in render,
   * and that is the whole design of this component.
   *
   * `persist` rehydrates while this module is evaluated — before React mounts
   * anything — so by the time an effect runs, `getState()` is the real answer,
   * synchronously and with no flag to wait on. Subscribing to it in render
   * instead means the value arrives through React's post-hydration snapshot
   * check, which is a race: it fired on some loads and not others, and when it
   * lost, the redirect never happened and a first-time visitor sat on a
   * skeleton forever. A redirect is a decision taken once; it must not depend
   * on whether a re-render happened to occur.
   */
  const redirecting = !query.isPending && railVisible && ids.length > 0;

  useEffect(() => {
    if (!redirecting) return;
    const target = pickLanding(useUi.getState().lastIntegrationsClient, ids);
    if (target) router.replace(`/integrations/${encodeURIComponent(target)}`);
  }, [redirecting, ids, router]);

  if (query.isPending || redirecting) {
    return <PageSkeleton shape="cards" rows={9} />;
  }

  return <>{children}</>;
}
