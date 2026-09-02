"use client";

import { useParams } from "next/navigation";
import { ClientRail, type Domain } from "@/components/client-rail";

/**
 * Rail + content, the master-detail frame all three trackers share.
 *
 * Rendered from a LAYOUT rather than from each page, so the rail keeps its
 * scroll position and its filter text when you move between clients. Rendering
 * it per-page would remount it on every navigation — the list would jump back
 * to the top and clear the filter you just typed, which is exactly the
 * behaviour that made the old app's rail unusable with 22 clients.
 *
 * `useParams` rather than a prop because a layout does not re-render on a
 * param change in the App Router; reading the param in a client component is
 * what keeps the highlight in sync with the URL.
 */
export function TrackerShell({
  domain,
  children,
}: {
  domain: Domain;
  children: React.ReactNode;
}) {
  const params = useParams<{ clientId?: string }>();

  return (
    <div className="flex h-full min-h-0">
      {/* The rail is desktop-only. Below 768px it would eat the screen; the
          mobile route is the index page's own list, which is the same data. */}
      <div className="hidden md:flex">
        <ClientRail
          domain={domain}
          activeId={params.clientId}
          hrefFor={(c) => `/${domainSegment(domain)}/${c.id}`}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}

function domainSegment(d: Domain): string {
  return d === "integrations"
    ? "integrations"
    : d === "implementation"
      ? "implementation"
      : "ams";
}
