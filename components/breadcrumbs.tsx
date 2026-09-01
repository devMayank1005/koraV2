"use client";

import Link from "next/link";
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
