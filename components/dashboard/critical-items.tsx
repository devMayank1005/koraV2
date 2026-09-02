"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import type { CriticalItem } from "@/lib/domain/dashboard";

/**
 * The critical-items list — the union of overdue integrations, at-risk phases
 * and open L3/L4 tickets, worst first.
 *
 * Shared by both dashboards, because it is the same question at two scopes:
 * the admin sees the portfolio, an editor sees their own name. That is the ONLY
 * difference between them, so filtering happens at the call site and this
 * renders whatever it is given.
 *
 * Severity 0 (overdue, L4) is marked; severity 1 (stale, L3) is not. The order
 * already encodes it, but a list where everything looks equally urgent is a
 * list nobody triages.
 */
export function CriticalItems({
  items,
  limit = 8,
  emptyTitle = "Nothing needs attention",
  emptyHint,
}: {
  items: CriticalItem[];
  limit?: number;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <>
      <ul className="divide-y divide-k-line-2">
        {items.slice(0, limit).map((item, i) => (
          <li key={`${item.clientId}-${item.title}-${i}`} className="py-2.5 first:pt-0">
            <div className="flex items-start gap-2">
              {item.severity === 0 && (
                <AlertTriangle
                  size={13}
                  strokeWidth={1.5}
                  aria-label="Highest severity"
                  className="mt-0.5 shrink-0 text-k-text-red"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-k-ink">
                  <Link href={hrefFor(item)} className="hover:text-k-primary hover:underline">
                    {item.title}
                  </Link>
                </p>
                <p className="mt-0.5 text-[11.5px] text-k-mute">
                  {item.client} · {item.detail}
                  {item.owner && <> · {item.owner}</>}
                </p>
              </div>
              <span className="k-tag shrink-0 text-[10px]">{item.domain}</span>
            </div>
          </li>
        ))}
      </ul>

      {items.length > limit && (
        <p className="mt-2.5 text-[11px] text-k-mute">
          {items.length - limit} more not shown
        </p>
      )}
    </>
  );
}

/**
 * Where an item links to.
 *
 * An integration goes to its record; everything else goes to the client's own
 * screen for that domain, because a phase or an AMS entry has no URL of its own
 * that would land you usefully.
 */
function hrefFor(item: CriticalItem): string {
  if (item.integId) {
    return `/integrations/${item.clientId}/${encodeURIComponent(item.integId)}`;
  }
  if (item.domain === "Implementation") return `/implementation/${item.clientId}`;
  if (item.domain === "AMS") return `/ams/${item.clientId}`;
  return `/integrations/${item.clientId}`;
}
