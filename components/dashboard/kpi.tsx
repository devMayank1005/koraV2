import Link from "next/link";

/**
 * A KPI card, with the handoff's `border-left: 3px` accent.
 *
 * The accent is the only place a saturated fill touches this card, and it is a
 * 3px bar — graphical, so a fill is right. The number and the label are both
 * text and take text tokens.
 */
export function Kpi({
  label,
  value,
  accent,
  sub,
  href,
  size = 28,
}: {
  label: string;
  value: string | number;
  /** A CSS colour for the left rule. */
  accent: string;
  sub?: React.ReactNode;
  href?: string;
  size?: number;
}) {
  const inner = (
    <>
      <span className="k-eyebrow">{label}</span>
      <span
        className="k-num mt-1.5 block leading-none"
        style={{ fontSize: size }}
      >
        {value}
      </span>
      {sub && <span className="mt-1 block text-[11px] text-k-mute">{sub}</span>}
    </>
  );

  const className =
    "k-card block p-3.5" + (href ? " k-card-hover" : "");
  const style = { borderLeft: `3px solid ${accent}` };

  return href ? (
    <Link href={href} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}

/** The 6-up strip. Collapses to 3 then 2 rather than scrolling sideways. */
export function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {children}
    </div>
  );
}
