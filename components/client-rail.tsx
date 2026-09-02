"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useClientList } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
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
 * Integrations has no membership flag; every client can hold integrations.
 */
export function ClientRail({
  domain,
  activeId,
  hrefFor,
}: {
  domain: Domain;
  activeId?: string;
  hrefFor: (c: ClientSummary) => string;
}) {
  const query = useClientList();
  const [term, setTerm] = useState("");

  const clients = useMemo(() => {
    const all = query.data ?? [];
    const inDomain = all.filter((c) =>
      domain === "implementation"
        ? c.hasImplementation
        : domain === "ams"
          ? c.hasAms
          : true,
    );
    const t = term.trim().toLowerCase();
    return t
      ? inDomain.filter((c) => c.name.toLowerCase().includes(t))
      : inDomain;
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
      style={{ width: 268 }}
      aria-label="Clients"
    >
      <div className="border-b border-k-line p-3">
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
            placeholder="Filter clients"
            aria-label="Filter clients"
            className="k-input k-input-sm w-full !pl-8"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <QueryState
          isPending={query.isPending}
          error={query.error}
          onRetry={() => query.refetch()}
          isEmpty={clients.length === 0}
          skeletonRows={8}
          empty={
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
          }
        >
          <ul className="space-y-0.5">
            {clients.map((c) => {
              const active = c.id === activeId;
              const n = countFor(c);
              return (
                <li key={c.id}>
                  <Link
                    href={hrefFor(c)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-[4px] px-2.5 py-2 text-[12.5px] transition-colors ${
                      active
                        ? "bg-k-primary/[.08] font-semibold text-k-primary"
                        : "text-k-ink hover:bg-k-surface"
                    }`}
                  >
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span
                      className="k-mono shrink-0 text-[11px] text-k-mute"
                      title={`${n} ${noun}${n === 1 ? "" : "s"}`}
                    >
                      {n}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </QueryState>
      </div>

      {clients.length > 0 && (
        <div className="border-t border-k-line px-3 py-2 text-[11px] text-k-mute">
          {clients.length} client{clients.length === 1 ? "" : "s"}
        </div>
      )}
    </aside>
  );
}
