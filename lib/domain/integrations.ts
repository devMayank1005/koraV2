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
 * Per-client Integration RAG.
 * Red if anything is At Risk or overdue; Amber if anything is stale but not
 * overdue; otherwise Green. Null when the client has no integrations at all,
 * which the scorecard renders as "stream not tracked".
 */
export function integRagLabel(c: Client, now?: Date): Rag | null {
  const integs = c.integrations ?? [];
  if (!integs.length) return null;

  const atRisk = integs.filter((i) => i.status === "At Risk").length;
  const overdue = integs.filter((i) => isOverdue(i, now)).length;
  if (atRisk > 0 || overdue > 0) return "Red";

  const stale = integs.filter(
    (i) => isStale(i, 7, now) && !isOverdue(i, now),
  ).length;
  if (stale > 0) return "Amber";

  return "Green";
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

/** Status counts for the three-segment bar on client rail cards. */
export function integStatusSegments(c: Client, now?: Date) {
  const integs = c.integrations ?? [];
  const done = integs.filter((i) => i.status === "Completed").length;
  const risk = integs.filter(
    (i) => i.status === "At Risk" || isOverdue(i, now),
  ).length;
  const wip = integs.length - done - risk;
  return { done, wip: Math.max(0, wip), risk, total: integs.length };
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
