"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Minus, Sparkles } from "lucide-react";
import { useClientTrees, useSnapshots, useCapacityWeights } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
import { RagDot } from "@/components/ui/status";
import { Kpi, KpiStrip } from "./kpi";
import { CriticalItems } from "./critical-items";
import { fmtDate } from "@/lib/utils/dates";
import { STATUS_COLORS } from "@/lib/domain/constants";
import {
  buildCriticalItems,
  healthRows,
  portfolioScore,
  upcomingDeadlines,
  hygieneScore,
  severityDistribution,
  blockers,
  teamBandwidth,
  updatesInWindow,
  allIntegrations,
  openAmsEntries,
  type HealthRow,
  type Trend,
} from "@/lib/domain/dashboard";

/**
 * The admin dashboard (artboard 1b): the six-up KPI strip over the portfolio
 * tiles.
 *
 * EVERY NUMBER HERE COMES FROM `lib/domain/dashboard.ts`. That matters more
 * than it sounds. In the old app all of this was computed INLINE inside
 * dashboard.js's render function, which is why none of it was testable and why
 * `phaseFunnel` was able to drift from the original for months without anyone
 * noticing — it counted six statuses the original did not. The port made each
 * aggregation a named pure function and the golden suite now diffs all of them
 * against a transcription of the original. A tile that computed its own number
 * here would step straight back outside that net.
 */
export function AdminDashboard() {
  const trees = useClientTrees();
  const snaps = useSnapshots();
  const weights = useCapacityWeights();

  const clients = useMemo(() => trees.data ?? [], [trees.data]);

  const view = useMemo(() => {
    if (!clients.length) return null;
    const rows = healthRows(clients, snaps.data ?? []);
    return {
      rows,
      score: portfolioScore(rows),
      critical: buildCriticalItems(clients),
      deadlines: upcomingDeadlines(clients, 14),
      hygiene: hygieneScore(clients),
      severity: severityDistribution(clients),
      blocked: blockers(clients),
      bandwidth: teamBandwidth(clients, weights),
      updates7: updatesInWindow(clients, 7),
      integrations: allIntegrations(clients),
      openAms: openAmsEntries(clients),
    };
  }, [clients, snaps.data, weights]);

  return (
    <div className="p-7">
      <header>
        <h1 className="k-page-title">Portfolio</h1>
        <p className="mt-1 text-[12.5px] text-k-mute">
          Every client, across all three trackers.
        </p>
      </header>

      <div className="mt-5">
        <QueryState
          isPending={trees.isPending}
          error={trees.error}
          onRetry={() => trees.refetch()}
          isEmpty={!view}
          skeletonRows={10}
          empty={<EmptyState title="No clients yet" />}
        >
          {view && (
            <>
              <KpiStrip>
                <Kpi
                  label="Portfolio score"
                  value={view.score}
                  accent={scoreAccent(view.score)}
                  sub="0–100, weighted by RAG"
                />
                <Kpi
                  label="Clients"
                  value={view.rows.length}
                  accent="var(--k-primary)"
                  sub={`${view.rows.filter((r) => r.overall === "Red").length} red`}
                />
                <Kpi
                  label="Needs attention"
                  value={view.critical.length}
                  accent="var(--k-fill-risk)"
                  sub={`${view.critical.filter((c) => c.severity === 0).length} highest`}
                />
                <Kpi
                  label="Integrations"
                  value={view.integrations.length}
                  accent="var(--k-cyan)"
                  sub={`${view.integrations.filter((i) => i.status === "Completed").length} complete`}
                  href="/integrations"
                />
                <Kpi
                  label="Open AMS"
                  value={view.openAms.length}
                  accent="var(--k-olive)"
                  // Deliberately "of N logged" rather than a critical count.
                  // `severityDistribution` spans EVERY entry, open and closed,
                  // so pairing its L4 figure with an open-only headline would
                  // put two different populations in one card — which is how
                  // this card read until the two numbers were compared.
                  sub={`of ${view.severity.total} logged`}
                  href="/ams"
                />
                <Kpi
                  label="Updates, 7 days"
                  value={view.updates7}
                  accent="var(--k-teal)"
                  sub={`hygiene ${view.hygiene.score}%`}
                />
              </KpiStrip>

              <div className="mt-5 grid gap-5 xl:grid-cols-3">
                <section className="k-card p-4 xl:col-span-2">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Needs attention</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {view.critical.length}
                    </span>
                  </div>
                  <div className="mt-3">
                    <CriticalItems
                      items={view.critical}
                      emptyTitle="Nothing is overdue, stale or critical"
                      emptyHint="Every integration, phase and ticket is inside its thresholds."
                    />
                  </div>
                </section>

                <section className="k-card p-4">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Due in 14 days</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {view.deadlines.length}
                    </span>
                  </div>
                  <div className="mt-3">
                    {view.deadlines.length === 0 ? (
                      <EmptyState title="Nothing due in the next fortnight" />
                    ) : (
                      <ul className="divide-y divide-k-line-2">
                        {view.deadlines.slice(0, 8).map((d, i) => (
                          <li key={`${d.date}-${d.title}-${i}`} className="py-2 first:pt-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="min-w-0 truncate text-[12.5px] text-k-ink">
                                {d.title}
                              </p>
                              <span className="k-mono shrink-0 text-[11px] text-k-mute">
                                {fmtDate(d.date)}
                              </span>
                            </div>
                            <p className="text-[11px] text-k-mute">
                              {d.client} · {d.tag}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <section className="k-card p-4 xl:col-span-2">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Client health</h2>
                    <span className="text-[11px] text-k-mute">
                      trend over the last fortnight
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <HealthTable rows={view.rows} />
                  </div>
                </section>

                <section className="k-card p-4">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Team load</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {view.bandwidth.rows.length}
                    </span>
                  </div>
                  <div className="mt-3">
                    {view.bandwidth.rows.length === 0 ? (
                      <EmptyState title="Nothing is assigned" />
                    ) : (
                      <ul className="space-y-2">
                        {view.bandwidth.rows.slice(0, 10).map((r) => {
                          const pct = Math.min(
                            100,
                            (r.total / Math.max(1, weights.cap)) * 100,
                          );
                          const over = r.total > weights.cap;
                          return (
                            <li key={r.name}>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate text-[12px] text-k-ink">
                                  {r.name}
                                </span>
                                <span
                                  className={`k-mono shrink-0 text-[11px] ${
                                    over ? "font-semibold text-k-text-red" : "text-k-mute"
                                  }`}
                                >
                                  {Math.round(r.total * 10) / 10}/{weights.cap}
                                </span>
                              </div>
                              <span
                                className="mt-1 block overflow-hidden rounded-[2px]"
                                style={{ height: 4, background: "var(--k-line-2)" }}
                              >
                                <span
                                  className="block h-full rounded-[2px]"
                                  style={{
                                    width: `${pct}%`,
                                    background: over
                                      ? "var(--k-fill-risk)"
                                      : "var(--k-primary)",
                                  }}
                                />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>

                <section className="k-card p-4">
                  <h2 className="k-card-title">Hygiene</h2>
                  <p className="mt-2">
                    <span className="k-num text-[28px] leading-none">
                      {view.hygiene.score}%
                    </span>
                  </p>
                  <dl className="mt-3 space-y-1.5 text-[12px]">
                    <HygieneRow label="Have an assignee" v={view.hygiene.assignee} />
                    <HygieneRow label="Have a due date" v={view.hygiene.due} />
                    <HygieneRow label="Updated recently" v={view.hygiene.fresh} />
                  </dl>
                </section>

                <section className="k-card p-4">
                  {/* "AMS by severity", not "OPEN AMS by severity". The counts
                      span every entry ever logged; only the age line below is
                      restricted to open tickets. Saying "open" over a total of
                      61 while the KPI card says 37 open is the kind of quiet
                      contradiction that makes people stop trusting a
                      dashboard. */}
                  <div className="k-card-head">
                    <h2 className="k-card-title">AMS by severity</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {view.severity.total}
                    </span>
                  </div>
                  {view.severity.total === 0 ? (
                    <p className="mt-3 text-[12px] text-k-mute">
                      Nothing logged.
                    </p>
                  ) : (
                    <>
                      <ul className="mt-3 space-y-1.5 text-[12px]">
                        {Object.entries(view.severity.counts)
                          .filter(([, n]) => n > 0)
                          .map(([level, n]) => (
                            <li
                              key={level}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-k-ink-3">{level}</span>
                              <span className="k-mono text-k-mute">{n}</span>
                            </li>
                          ))}
                      </ul>
                      <p className="mt-2 border-t border-k-line-2 pt-2 text-[11px] text-k-mute">
                        All entries, open and closed. {view.openAms.length} are
                        still open.
                      </p>
                      {view.severity.oldestCriticalDays !== null && (
                        <p className="mt-1 text-[11.5px] font-semibold text-k-text-red">
                          Oldest OPEN L3/L4 ticket:{" "}
                          {view.severity.oldestCriticalDays} days
                        </p>
                      )}
                    </>
                  )}
                </section>

                <section className="k-card p-4">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Blockers</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {view.blocked.length}
                    </span>
                  </div>
                  <div className="mt-3">
                    {view.blocked.length === 0 ? (
                      <EmptyState title="Nothing is blocked" icon={Sparkles} />
                    ) : (
                      <ul className="space-y-2">
                        {view.blocked.slice(0, 6).map((b, i) => (
                          <li key={`${b.client}-${i}`}>
                            <p className="text-[12px] text-k-ink">{b.text}</p>
                            <p className="text-[11px] text-k-mute">{b.client}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function HealthTable({ rows }: { rows: HealthRow[] }) {
  return (
    <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
      <thead>
        <tr className="k-thead-plain">
          <th className="px-2 py-1.5 text-left font-semibold">Client</th>
          <th className="px-2 py-1.5 text-left font-semibold">Integ</th>
          <th className="px-2 py-1.5 text-left font-semibold">Impl</th>
          <th className="px-2 py-1.5 text-left font-semibold">AMS</th>
          <th className="px-2 py-1.5 text-left font-semibold">Overall</th>
          <th className="px-2 py-1.5 text-left font-semibold">Trend</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="k-row">
            <td className="px-2 py-1.5">
              <Link
                href={`/integrations/${r.id}`}
                className="text-k-ink hover:text-k-primary hover:underline"
              >
                {r.name}
              </Link>
            </td>
            <td className="px-2 py-1.5">
              {r.integR ? <RagDot rag={r.integR} /> : <Dash />}
            </td>
            <td className="px-2 py-1.5">
              {r.implR ? <RagDot rag={r.implR} /> : <Dash />}
            </td>
            <td className="px-2 py-1.5">
              {r.amsR ? <RagDot rag={r.amsR} /> : <Dash />}
            </td>
            <td className="px-2 py-1.5">
              <RagDot rag={r.overall} />
            </td>
            <td className="px-2 py-1.5">
              <TrendMark trend={r.trend} />
            </td>
        </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The trend arrow.
 *
 * Up is better, and here that is the literal truth rather than a convention:
 * `rankRag` scores Red 0, Amber 1, Green 2, and the trend is newest minus
 * oldest, so a positive difference is a client that has got greener.
 *
 * WORTH KNOWING because the LIVE APP DRAWS THIS BACKWARDS — it subtracts the
 * other way round, on the one tile whose whole purpose is showing which clients
 * are deteriorating. The port deliberately breaks with it and the golden suite
 * pins both directions, so anyone comparing the two screens side by side during
 * cutover will find they disagree. That is intended.
 *
 * The word is rendered next to the arrow because a direction alone is a
 * convention the reader has to already share.
 */
function TrendMark({ trend }: { trend: Trend }) {
  if (trend === "new") {
    return <span className="text-[11px] text-k-mute">new</span>;
  }
  if (trend === "same") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-k-mute">
        <Minus size={11} strokeWidth={1.5} aria-hidden />
        <span className="sr-only">unchanged</span>
      </span>
    );
  }
  const better = trend === "better";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${
        better ? "text-k-text-green" : "text-k-text-red"
      }`}
      title={better ? "Improving" : "Worsening"}
    >
      {better ? (
        <ArrowUp size={11} strokeWidth={1.5} aria-hidden />
      ) : (
        <ArrowDown size={11} strokeWidth={1.5} aria-hidden />
      )}
      {better ? "better" : "worse"}
    </span>
  );
}

function Dash() {
  return <span className="text-k-mute">—</span>;
}

function HygieneRow({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-k-ink-3">{label}</dt>
      <dd className="k-mono text-k-mute">{Math.round(v * 100)}%</dd>
    </div>
  );
}

function scoreAccent(score: number): string {
  if (score >= 70) return STATUS_COLORS.Completed.fill;
  if (score >= 40) return STATUS_COLORS.Delayed.fill;
  return STATUS_COLORS["At Risk"].fill;
}
