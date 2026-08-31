/**
 * Date helpers, ported from the old app's js/core.js:235-236.
 *
 * Every RAG calculation in the app is built on `daysDiff`, so these are ported
 * behaviour-for-behaviour rather than "improved" — a change here silently moves
 * every health indicator in the product.
 *
 * KNOWN QUIRK, ported deliberately: `todayStr()` derives the date from
 * `toISOString()`, which is UTC. For the India-based team (UTC+5:30) that means
 * between 00:00 and 05:29 local, "today" is still yesterday's date. It has been
 * this way since the app shipped and all stored dates are consistent with it.
 * Fixing it would shift RAG results, so it is left as-is and tracked separately.
 */

/** Today as `YYYY-MM-DD` (UTC-derived — see the quirk note above). */
export function todayStr(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whole days between `dateStr` and today.
 * POSITIVE means the date is in the PAST (e.g. 6 = six days overdue).
 * Returns null for an empty/missing date.
 */
export function daysDiff(
  dateStr: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayStr(now) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((t.getTime() - d.getTime()) / 86400000);
}

/** `YYYY-MM-DD` for `days` from now, used for "due soon" windows. */
export function addDaysStr(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** en-IN short date: `31 Aug 2026`. Falsy input renders as an em dash. */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

/** en-IN date + time, used on activity timestamps. */
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}
