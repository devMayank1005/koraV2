import { daysDiff } from "@/lib/utils/dates";
import { SIGNOFF_PHASES } from "./constants";
import type { Client, Phase, Rag } from "./types";

/** Implementation progress + health, ported from js/implementation.js:2-6 and :288-310. */

export function implProgress(client: Client) {
  let total = 0;
  let completed = 0;
  let atRisk = 0;
  for (const m of client.modules ?? []) {
    for (const ph of m.phases ?? []) {
      total++;
      if (ph.status === "Completed") completed++;
      if (ph.status === "At Risk") atRisk++;
    }
  }
  return {
    total,
    completed,
    atRisk,
    pct: total ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Per-client Implementation RAG.
 *
 * Only phases that are neither Completed nor Not Started count as "in progress".
 * For each of those, worst signal wins:
 *   - status At Risk                        -> Red
 *   - target date slipped by >= 14 days     -> Red
 *   - target date slipped by >= 1 day       -> Amber
 *   - no updates at all                     -> Amber
 *   - last update >= 14 days ago            -> Red
 *   - last update >= 7 days ago             -> Amber
 *
 * A client whose phases are all Completed/Not Started is Green (provided it has
 * modules); a client with no modules at all returns null ("not tracked").
 *
 * Ported verbatim, including that the date-slip check short-circuits the
 * staleness check for the same phase.
 */
export function implAutoRag(client: Client, now: Date = new Date()): Rag | null {
  let hasRed = false;
  let hasAmber = false;
  let hasInProgress = false;

  for (const m of client.modules ?? []) {
    for (const ph of m.phases ?? []) {
      if (ph.status === "Completed" || ph.status === "Not Started") continue;
      hasInProgress = true;

      if (ph.status === "At Risk") {
        hasRed = true;
        continue;
      }

      if (ph.targetDate) {
        const d = daysDiff(ph.targetDate, now);
        if (d !== null && d >= 14) {
          hasRed = true;
          continue;
        }
        if (d !== null && d >= 1) {
          hasAmber = true;
          continue;
        }
      }

      const updates = ph.updates ?? [];
      if (!updates.length) {
        hasAmber = true;
        continue;
      }

      // Newest timestamp wins; entries may carry addedAt or fall back to date.
      const lastUpd = updates.reduce((acc, u) => {
        const dt = u.addedAt || u.date || "";
        return dt > acc ? dt : acc;
      }, "");
      const daysAgo = lastUpd
        ? Math.floor((now.getTime() - new Date(lastUpd).getTime()) / 86400000)
        : 99;

      if (daysAgo >= 14) hasRed = true;
      else if (daysAgo >= 7) hasAmber = true;
    }
  }

  if (!hasInProgress && (client.modules ?? []).length > 0) return "Green";
  if (hasRed) return "Red";
  if (hasAmber) return "Amber";
  if (!hasInProgress) return null;
  return "Green";
}

export function isSignoffPhase(phaseName: string): boolean {
  return SIGNOFF_PHASES.includes(phaseName);
}

/**
 * Sign-off gate, ported from js/events.js:296-303.
 *
 * A sign-off phase cannot be marked Completed unless at least one of its
 * updates carries an attachment — that attachment IS the sign-off evidence.
 * Non-sign-off phases completing without any attachment get a soft advisory
 * (`warn`), not a block.
 */
export function canCompletePhase(
  phase: Phase,
): { ok: true; warn?: string } | { ok: false; reason: string } {
  const updates = phase.updates ?? [];
  const hasAttachment = updates.some((u) => u.attachment?.storagePath);

  if (isSignoffPhase(phase.name) && !hasAttachment) {
    return {
      ok: false,
      reason: `${phase.name} needs a signed-off document attached to an update before it can be completed.`,
    };
  }

  if (!hasAttachment) {
    return {
      ok: true,
      warn: "Completing without an attachment — consider attaching evidence.",
    };
  }

  return { ok: true };
}

/** Counts per phase name across all modules — drives the phase-funnel tile. */
export function phaseFunnel(clients: Client[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of clients) {
    for (const m of c.modules ?? []) {
      for (const ph of m.phases ?? []) {
        if (ph.status === "Completed" || ph.status === "Not Started") continue;
        out[ph.name] = (out[ph.name] ?? 0) + 1;
      }
    }
  }
  return out;
}
