"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useClientList } from "@/lib/query/hooks";
import { inIntegrationsTracker } from "@/lib/domain/integrations";
import { QueryState, EmptyState } from "@/components/ui/states";
import { RagDot } from "@/components/ui/status";
import { STATUS_COLORS } from "@/lib/domain/constants";
import { integRagFromHealth, integSegments } from "@/lib/domain/integrations";
import type { ClientSummary } from "@/lib/db/queries/clients";

export type Domain = "implementation" | "ams" | "integrations";

/**
 * The 268px client rail (artboard 1c), shared by all three trackers.
 *
 * ONE component rather than three, because the only real difference between
 * the Integrations, Implementation and AMS rails is which clients belong in
 * them and what count sits on the right. The old app had the list rebuilt
 * inline on each screen, which is why its three rails drifted apart in
 * sort order and empty-state wording.
 *
 * DOMAIN FILTERING IS THE POINT. Implementation and AMS are opt-in domains: a
 * client appears in that rail only if `has_implementation` / `has_ams` is set,
 * NOT if it happens to have modules or work-log rows. Those are different
 * questions, and conflating them is precisely the bug migration 0003 exists to
 * prevent — six clients are in a domain with nothing in it yet, and filtering
 * on counts would silently drop all six.
 *
 * Integrations has no membership flag, so PRESENCE is its rule instead: a
 * client is listed once it actually has an integration. That is the opposite
 * of the paragraph above and is correct for the opposite reason — there is no
 * flag to read, and a client with none has nothing to show on a screen whose
 * job is triage. The rule lives in `inIntegrationsTracker` so the index and the
 * landing redirect cannot drift from it.
 *
 * HIDDEN IS NOT GONE. The presence rule lifts while you are searching, because
 * the `+ Integration` button lives on the client's own page and nothing else in
 * the app can give a client its first integration — a name typed into the
 * filter box has to still find it. Membership filtering does not lift: it is
 * about belonging, not emptiness.
 *
 * ONLY INTEGRATIONS GETS THE DOT AND THE BAR. 1c is the only artboard that
 * draws this rail, and `integHealth` is the only per-domain health the list
 * endpoint carries — Implementation and AMS would need their own aggregates and
 * their own designed treatment. They keep the same card geometry with their own
 * meta line, so the three rails stay one component instead of drifting again.
 */
export function ClientRail({
  domain,
  activeId,
  hrefFor,
  width = 268,
}: {
  domain: Domain;
  activeId?: string;
  hrefFor: (c: ClientSummary) => string;
  /** From the resizable pane in TrackerShell. */
  width?: number;
}) {
  const query = useClientList();
  const [term, setTerm] = useState("");

  const clients = useMemo(() => {
    const all = query.data ?? [];
    const t = term.trim().toLowerCase();

    const inDomain = all.filter((c) =>
      domain === "implementation"
        ? c.hasImplementation
        : domain === "ams"
          ? c.hasAms
          : // Searching lifts the presence rule, so a client with no
            // integrations is still reachable by name — see the docblock.
            t !== "" || inIntegrationsTracker(c.counts.integrations),
    );

    return t
      ? inDomain.filter((c) => c.name.toLowerCase().includes(t))
      : inDomain;
  }, [query.data, domain, term]);

  /**
   * How many the presence rule is holding back, stated rather than silent.
   *
   * A list that quietly drops a quarter of its rows and says nothing is how
   * someone concludes a client has been deleted.
   */
  const hidden = useMemo(() => {
    if (domain !== "integrations" || term.trim() !== "") return 0;
    return (query.data ?? []).filter(
      (c) => !inIntegrationsTracker(c.counts.integrations),
    ).length;
  }, [query.data, domain, term]);

  const countFor = (c: ClientSummary) =>
    domain === "implementation"
      ? c.counts.modules
      : domain === "ams"
        ? c.counts.workLog
        : c.counts.integrations;

  const noun =
    domain === "implementation"
      ? "module"
      : domain === "ams"
        ? "entry"
        : "integration";

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-k-line bg-k-paper"
      style={{ width }}
      aria-label="Clients"
    >
      <div className="border-b border-k-line-2 p-4">
        <h2 className="mb-3 text-[14px] font-bold text-k-ink">
          Clients
        </h2>
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-k-mute"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Filter clients…"
            aria-label="Filter clients"
            className="k-input k-input-sm w-full !pl-8"
          />
        </div>
      </div>

      {/* No padding on the scroller: 1c's cards are full-bleed, divided by a
          hairline rather than separated by a gap. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueryState
          isPending={query.isPending}
          isPaused={query.isPaused}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={clients.length === 0}
          skeletonRows={8}
          empty={
            <div className="p-3">
              <EmptyState
                title={term ? "No match" : "No clients in this tracker"}
                hint={
                  term
                    ? `Nothing matches "${term.trim()}".`
                    : domain === "integrations"
                      ? undefined
                      : "A client appears here once it is added to this domain."
                }
              />
            </div>
          }
        >
          <ul>
            {clients.map((c) => (
              <li key={c.id}>
                <ClientCard
                  client={c}
                  href={hrefFor(c)}
                  active={c.id === activeId}
                  count={countFor(c)}
                  noun={noun}
                  showHealth={domain === "integrations"}
                />
              </li>
            ))}
          </ul>
        </QueryState>
      </div>

      {/* 1c has no footer here. While filtering, the count is the input's only
          feedback — without it a typo just empties the list with no
          explanation. At rest it carries the one thing the artboard could not
          know about: how many clients the presence rule is holding back. */}
      {term.trim() !== "" && clients.length > 0 && (
        <div className="border-t border-k-line px-3 py-2 text-[11px] text-k-mute">
          {clients.length} of {(query.data ?? []).length} shown
        </div>
      )}
      {hidden > 0 && (
        <div className="border-t border-k-line px-3 py-2 text-[11px] text-k-mute">
          {hidden} with no integration{hidden === 1 ? "" : "s"} · search to find
          them
        </div>
      )}
    </aside>
  );
}

/**
 * One client card.
 *
 * The 3px left edge is present on every card as `transparent` rather than
 * added on selection, so selecting a client cannot shift its text by 3px.
 */
function ClientCard({
  client: c,
  href,
  active,
  count,
  noun,
  showHealth,
}: {
  client: ClientSummary;
  href: string;
  active: boolean;
  count: number;
  noun: string;
  showHealth: boolean;
}) {
  const rag = showHealth ? integRagFromHealth(c.integHealth) : null;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block border-b border-l-[3px] border-b-k-line-2 px-4 py-3 transition-colors ${
        active
          ? "border-l-k-primary bg-k-primary/[.05]"
          : "border-l-transparent hover:bg-k-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`min-w-0 truncate text-[13px] font-semibold ${
            active ? "text-k-primary" : "text-k-ink"
          }`}
        >
          {c.name}
        </span>
        {rag && <RagDot rag={rag} size={9} />}
      </div>

      <div className="mt-1.5 truncate text-[10.5px] text-k-mute-2">
        {count} {count === 1 ? noun : `${noun}s`}
        {c.masterAssignee && <> · {c.masterAssignee}</>}
      </div>

      {showHealth && <StatusBar health={c.integHealth} />}
    </Link>
  );
}

/**
 * The 4px three-segment bar: completed / in flight / at risk.
 *
 * A client with no integrations gets a flat empty track rather than nothing.
 * Fourteen of the twenty-two clients are in that state, and letting their cards
 * collapse 12px shorter than the rest would make the list look ragged for the
 * majority case. Zero-width segments are dropped rather than rendered at
 * `flex: 0`, which some engines still paint as a hairline.
 */
function StatusBar({ health }: { health: ClientSummary["integHealth"] }) {
  const seg = integSegments(health);

  const parts: { key: string; flex: number; fill: string }[] = [
    { key: "done", flex: seg.done, fill: STATUS_COLORS.Completed.fill },
    { key: "wip", flex: seg.wip, fill: STATUS_COLORS["In Progress"].fill },
    { key: "risk", flex: seg.risk, fill: STATUS_COLORS["At Risk"].fill },
  ].filter((p) => p.flex > 0);

  return (
    <>
      <div className="mt-2 flex h-1 gap-0.5" aria-hidden>
        {parts.length === 0 ? (
          <div className="flex-1 rounded-[2px] bg-k-line-2" />
        ) : (
          parts.map((p) => (
            <div
              key={p.key}
              className="rounded-[2px]"
              style={{ flex: p.flex, background: p.fill }}
            />
          ))
        )}
      </div>
      {/* The bar is the only place these three numbers appear. */}
      {seg.total > 0 && (
        <span className="sr-only">
          {seg.done} completed, {seg.wip} in progress, {seg.risk} at risk
        </span>
      )}
    </>
  );
}
