"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

/**
 * Breadcrumbs.
 *
 * Two presentations in the handoff, and the difference is not decorative: on
 * the tracker screens (1c, 1e) it is a full-width bar with a bottom rule, part
 * of the chrome; on the detail screens (1d, 1f) it is inline text above the
 * title. The bar version anchors a master-detail layout that has no page title
 * of its own.
 */

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({
  crumbs,
  variant = "bar",
}: {
  crumbs: Crumb[];
  variant?: "bar" | "inline";
}) {
  if (!crumbs.length) return null;

  const body = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    return (
      <Fragment key={`${c.label}-${i}`}>
        {i > 0 && (
          <span className="mx-1.5 text-k-field" aria-hidden="true">
            /
          </span>
        )}
        {c.href && !last ? (
          <Link href={c.href} className="hover:text-k-primary">
            {c.label}
          </Link>
        ) : (
          <span className={last ? "font-semibold text-k-ink" : undefined}>
            {c.label}
          </span>
        )}
      </Fragment>
    );
  });

  if (variant === "inline") {
    return (
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[12px] text-k-mute">
        {body}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-k-line bg-k-paper px-7 py-3.5 text-[12px] text-k-mute"
    >
      {body}
    </nav>
  );
}

/**
 * Breadcrumbs derived from the URL.
 *
 * Rendered by the app chrome so every tracker screen gets them without opting
 * in — the previous version exported a `Breadcrumbs` component that nothing
 * imported, so the app had none at all.
 *
 * Ids rather than names, for now. Resolving a client id to "Aster Retail
 * Group" needs the client tree, and fetching it here would put a request in
 * the chrome on every navigation for a label. The screens have that data
 * already and will pass richer crumbs in as they are built; this is the
 * fallback, not the destination.
 */
export function RouteBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // The dashboard is the root; a single crumb saying "Dashboard" above the
  // dashboard is noise.
  if (!segments.length || segments[0] === "dashboard") return null;

  const SECTIONS: Record<string, string> = {
    integrations: "Integrations",
    implementation: "Implementation",
    ams: "AMS & Support",
    admin: "Admin",
  };

  const [section, ...rest] = segments;
  const crumbs: Crumb[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: SECTIONS[section] ?? section, href: `/${section}` },
  ];

  for (const [i, seg] of rest.entries()) {
    crumbs.push({
      label: decodeURIComponent(seg),
      href: i < rest.length - 1 ? `/${section}/${rest.slice(0, i + 1).join("/")}` : undefined,
    });
  }

  return <Breadcrumbs crumbs={crumbs} />;
}
