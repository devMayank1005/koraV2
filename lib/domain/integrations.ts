import { daysDiff, todayStr } from "@/lib/utils/dates";
import type { Client, Integration, Milestone, Rag } from "./types";

/**
 * Integration health, ported from js/core.js:237-270.
 * Behaviour is preserved exactly — see lib/utils/dates for why.
 */

/** Overdue = has a due date in the past and isn't Completed. */
export function isOverdue(i: Integration, now?: Date): boolean {
  if (i.status === "Completed" || !i.dueDate) return false;
  const d = daysDiff(i.dueDate, now);
  return d !== null && d > 0;
}

/** Days past the due date. Null when there's no due date. */
export function daysOverdue(i: Integration, now?: Date): number | null {
  return daysDiff(i.dueDate, now);
}

/** Most recent timeline entry's date. The old app relies on timeline[0] being newest. */
export function lastUpdateDate(i: Integration): string | null {
  return i.timeline?.[0]?.date ?? null;
}

/**
 * Stale = not Completed and either never updated, or last updated `days` ago.
 * Note "never updated" counts as stale — that is intentional in the original.
 */
export function isStale(i: Integration, days = 7, now?: Date): boolean {
  if (i.status === "Completed") return false;
  const lu = lastUpdateDate(i);
  if (!lu) return true;
  const d = daysDiff(lu, now);
  return d !== null && d >= days;
}

/**
 * A client's integration health, reduced to four numbers.
 *
 * THE POINT OF THIS SHAPE: the client rail (artboard 1c) needs a RAG dot and a
 * status bar for all 22 clients at once, and it only ever holds `ClientSummary`
 * — no `integrations[]` to count. Rather than let the rail invent a second,
 * subtly different rule, the rule is stated once against these four numbers,
 * and both callers produce them: the tree-shaped screens by counting rows,
 * `listClients` by counting in SQL.
 *
 * `risk` folds At Risk and overdue together because the RAG has always treated
 * them identically, and counting them separately would double-count the
 * integration that is both.
 */
export interface IntegHealth {
  /** Active integrations. Zero means "stream not tracked", not "all green". */
  total: number;
  /** Completed. */
  done: number;
  /** At Risk or overdue. Disjoint from `done` — a Completed row is never either. */
  risk: number;
  /** Not Completed and not updated in 7+ days. Never updated counts as stale. */
  stale: number;
}

/**
 * Per-client Integration RAG, from the counts.
 * Red if anything is At Risk or overdue; Amber if anything is stale; otherwise
 * Green. Null when the client has no integrations at all, which the scorecard
 * renders as "stream not tracked".
 *
 * The original rule read "stale but not overdue" for Amber. That qualifier is
 * dead by the time it is reached — `risk > 0` has already returned Red — so
 * dropping it preserves behaviour exactly.
 */
export function integRagFromHealth(h: IntegHealth): Rag | null {
  if (!h.total) return null;
  if (h.risk > 0) return "Red";
  if (h.stale > 0) return "Amber";
  return "Green";
}

/** The same four numbers, counted off a fully-loaded client tree. */
export function integHealthOf(c: Client, now?: Date): IntegHealth {
  const integs = c.integrations ?? [];
  return {
    total: integs.length,
    done: integs.filter((i) => i.status === "Completed").length,
    risk: integs.filter((i) => i.status === "At Risk" || isOverdue(i, now)).length,
    stale: integs.filter((i) => isStale(i, 7, now)).length,
  };
}

export function integRagLabel(c: Client, now?: Date): Rag | null {
  return integRagFromHealth(integHealthOf(c, now));
}

/** Combine per-domain RAGs into one. Worst wins; all-null stays null. */
export function overallRagLabel(...rags: (Rag | null | undefined)[]): Rag | null {
  const present = rags.filter(Boolean) as Rag[];
  if (!present.length) return null;
  if (present.includes("Red")) return "Red";
  if (present.includes("Amber")) return "Amber";
  return "Green";
}

/**
 * Urgency tint for a Pending milestone, by due-date proximity.
 * Achieved/Missed milestones don't call this — they keep fixed colours.
 */
export function milestoneUrgency(
  ms: Milestone,
  now?: Date,
): "rose" | "orange" | "amber" {
  if (!ms.dueDate) return "amber";
  const d = daysDiff(ms.dueDate, now);
  if (d === null) return "amber";
  if (d > 0) return "rose"; // already past due
  if (d >= -3) return "orange"; // due within three days
  return "amber";
}

/**
 * The three-segment status bar on client rail cards and the Status mix footer.
 *
 * `wip` is deliberately "everything else" rather than a status list: the bar
 * has to add up to the total, and the ten statuses do not partition neatly into
 * three buckets. Clamped at zero so a future overlap in `done`/`risk` degrades
 * to a short bar instead of a negative flex.
 */
export function integSegments(h: IntegHealth) {
  return {
    done: h.done,
    wip: Math.max(0, h.total - h.done - h.risk),
    risk: h.risk,
    total: h.total,
  };
}

/** The same, straight off a client tree. */
export function integStatusSegments(c: Client, now?: Date) {
  return integSegments(integHealthOf(c, now));
}

/** Sort worst-first: At Risk/overdue, then stale, then everything else. */
export function integSeverityRank(i: Integration, now?: Date): number {
  if (i.status === "At Risk" || isOverdue(i, now)) return 0;
  if (isStale(i, 7, now)) return 1;
  if (i.status === "Completed") return 3;
  return 2;
}

export function sortIntegWorstFirst(
  integs: Integration[],
  now?: Date,
): Integration[] {
  return [...integs].sort(
    (a, b) =>
      integSeverityRank(a, now) - integSeverityRank(b, now) ||
      a.name.localeCompare(b.name),
  );
}

/** Human-readable reason an integration is flagged, for critical-item rows. */
export function integRiskReason(i: Integration, now?: Date): string | null {
  if (i.status === "At Risk") return "Marked At Risk";
  if (isOverdue(i, now)) {
    const d = daysOverdue(i, now);
    return `${d}d overdue`;
  }
  if (isStale(i, 7, now)) {
    const lu = lastUpdateDate(i);
    const d = lu ? daysDiff(lu, now) : null;
    return d === null ? "No updates" : `${d}d stale`;
  }
  return null;
}

/** Achieved / total, for the milestone summary on the record page. */
export function integMilestoneCounts(i: Integration) {
  const ms = i.milestones ?? [];
  return {
    total: ms.length,
    achieved: ms.filter((m) => m.status === "Achieved").length,
    missed: ms.filter((m) => m.status === "Missed").length,
    pending: ms.filter((m) => m.status === "Pending").length,
  };
}

/** Milestones and phase targets falling inside the next `days` days. */
export function isDueWithin(
  dateStr: string | null | undefined,
  days: number,
  now?: Date,
): boolean {
  if (!dateStr) return false;
  const d = daysDiff(dateStr, now);
  if (d === null) return false;
  // d is negative for future dates; -days..0 is "within the window".
  return d <= 0 && d >= -days;
}

export { todayStr };
