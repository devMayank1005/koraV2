"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Plus } from "lucide-react";
import { useClient } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
import { StatusPill, RagPill } from "@/components/ui/status";
import { ExportMenu } from "@/components/export-menu";
import { toast } from "sonner";
import { InlineSelect } from "@/components/ui/inline";
import { ArchiveButton } from "@/components/ui/archive-button";
import { AddIntegrationDialog } from "@/components/create/integration-dialog";
import { ClientEmailDialog } from "@/components/integrations/client-email-dialog";
import { useCanEdit, useAssigneeOptions } from "@/lib/query/permissions";
import { fmtDate } from "@/lib/utils/dates";
import { STATUSES } from "@/lib/domain/constants";
import {
  integRagLabel,
  sortIntegWorstFirst,
  isOverdue,
  isStale,
  integRiskReason,
  integMilestoneCounts,
  lastUpdateDate,
} from "@/lib/domain/integrations";
import { STATUS_COLORS } from "@/lib/domain/constants";
import type { Integration } from "@/lib/domain/types";

/**
 * One client's integrations (artboard 1c).
 *
 * WORST FIRST, not alphabetical. `sortIntegWorstFirst` ranks by the same
 * severity the RAG uses, so the row most likely to need action is the one you
 * read first — a tracker sorted by name makes you scan all 29 to find the one
 * that is overdue. The old app sorted by insertion order, which is neither.
 */
export function IntegrationsClientView({ clientId }: { clientId: string }) {
  const query = useClient(clientId);
  const [filter, setFilter] = useState<string>("all");
  const canEdit = useCanEdit();
  const assignees = useAssigneeOptions();
  const [adding, setAdding] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const client = query.data;

  const all = useMemo(
    () => (client ? sortIntegWorstFirst(client.integrations ?? []) : []),
    [client],
  );

  // Chip counts describe the WHOLE set, not the filtered one — a chip that
  // recounts itself after you click it can only ever read "3 of 3".
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const i of all) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [all]);

  const shown = filter === "all" ? all : all.filter((i) => i.status === filter);

  // Chips in STATUSES order, not alphabetical. That array is the app's
  // canonical status order — it already drives the very `InlineSelect` in the
  // Status column below — so a chip row sorted any other way would disagree
  // with the dropdown sitting two inches under it.
  const chipStatuses = useMemo(
    () => STATUSES.filter((st) => (counts[st] ?? 0) > 0),
    [counts],
  );

  const rag = client ? integRagLabel(client) : null;
  const staleCount = useMemo(() => all.filter((i) => isStale(i)).length, [all]);

  return (
    <div className="k-page">
      <QueryState
        isPending={query.isPending}
        isPaused={query.isPaused}
        error={query.error}
        onRetry={() => query.refetch()}
        skeletonRows={8}
      >
        {client && (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="k-page-title truncate">{client.name}</h1>
                {/* 1c's meta row. The RAG pill belongs HERE, beside the facts
                    it summarises, rather than over in the action group where it
                    read as a fourth button.
                    1c also carries "SAP SuccessFactors · Go-live 14 Nov 2026"
                    in this row. There is no platform or go-live column on
                    `Client` — that is invented data in the mockup — so the
                    client's description takes the slot when there is one. */}
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-k-mute">
                  {client.masterAssignee && (
                    <span>
                      Master owner{" "}
                      <strong className="font-semibold text-k-ink">
                        {client.masterAssignee}
                      </strong>
                    </span>
                  )}
                  {client.description && (
                    <>
                      {client.masterAssignee && (
                        <span className="text-k-mute-2" aria-hidden>
                          |
                        </span>
                      )}
                      <span className="min-w-0 truncate">
                        {client.description}
                      </span>
                    </>
                  )}
                  {rag && <RagPill rag={rag} />}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Before the canEdit gate on purpose: v1 showed the export
                    menu to every role on this screen, and a viewer being able
                    to produce the client report is the point of the role. */}
                <ExportMenu
                  items={[
                    {
                      label: "Integration Report (PDF)",
                      run: async () => {
                        const { exportIntegrationPdf } = await import(
                          "@/lib/export/integration-pdf"
                        );
                        await exportIntegrationPdf(client);
                        toast.success("Report downloaded.");
                      },
                    },
                    ...(canEdit
                      ? [
                          {
                            label: "Email report to client…",
                            run: () => setEmailing(true),
                          },
                        ]
                      : []),
                    {
                      label: "Excel (Integrations)",
                      run: async () => {
                        const { exportClientExcel } = await import("@/lib/export/excel");
                        await exportClientExcel("integrations", client);
                        toast.success("Spreadsheet downloaded.");
                      },
                    },
                    {
                      label: "Excel (Milestones)",
                      // Disabled rather than hidden: a client with no
                      // milestones would otherwise get a valid, empty file and
                      // wonder what went wrong.
                      disabledReason: (client.integrations ?? []).some(
                        (i) => (i.milestones ?? []).length > 0,
                      )
                        ? undefined
                        : "none yet",
                      run: async () => {
                        const { exportClientExcel } = await import("@/lib/export/excel");
                        await exportClientExcel("milestones", client);
                        toast.success("Spreadsheet downloaded.");
                      },
                    },
                  ]}
                />
                {canEdit && (
                  <button
                    type="button"
                    className="k-btn k-btn-primary k-btn-sm"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={13} strokeWidth={1.5} aria-hidden />
                    Integration
                  </button>
                )}
              </div>
            </header>

            {emailing && (
              <ClientEmailDialog
                client={client}
                open
                onOpenChange={(o) => !o && setEmailing(false)}
              />
            )}

            <AddIntegrationDialog
              clientId={clientId}
              clientName={client.name}
              open={adding}
              onOpenChange={setAdding}
            />

            {/* Status filter chips — new in the reskin; the old app had no
                way to narrow this table at all. */}
            {all.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Filter by status"
                >
                  <Chip
                    label="All"
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                  />
                  {chipStatuses.map((status) => (
                    <Chip
                      key={status}
                      label={status}
                      active={filter === status}
                      onClick={() => setFilter(status)}
                    />
                  ))}
                </div>
                {/* The per-chip counts 1c drops are not lost — the Status mix
                    card under the table carries all of them at once, which is
                    the comparison you actually want them for. */}
                <span
                  className="ml-auto text-[11.5px] text-k-mute-2"
                  aria-live="polite"
                >
                  {shown.length} of {all.length} shown
                </span>
              </div>
            )}

            <div className="mt-4">
              {shown.length === 0 ? (
                <EmptyState
                  title={
                    all.length === 0
                      ? "No integrations yet"
                      : `Nothing with status "${filter}"`
                  }
                  hint={
                    all.length === 0
                      ? "Integrations added for this client will appear here."
                      : undefined
                  }
                />
              ) : (
                <IntegrationTable
                  clientId={clientId}
                  rows={shown}
                  canEdit={canEdit}
                  assignees={assignees}
                />
              )}
            </div>

            {/* Both cards read the WHOLE set, never the filtered one. A status
                mix that recomposed itself after you clicked "At Risk" could
                only ever say "100% At Risk". */}
            {all.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-3.5">
                <StatusMix rows={all} />
                <Staleness count={staleCount} />
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

/**
 * A status filter chip.
 *
 * The active look is tinted rather than the stylesheet's
 * `.k-chip[data-active="true"]`, which is a solid primary fill with white text.
 * 1c's chips are tinted, and a row of solid blue blocks would out-shout the
 * table they filter.
 */
function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`k-chip k-chip-sm ${
        active
          ? "border-k-primary bg-k-primary/[.08] font-semibold text-k-primary"
          : "text-k-ink-3"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Status mix — one bar, one segment per status actually present.
 *
 * Segment order follows STATUSES rather than descending count, so the bar for
 * one client can be compared against another's: a segment that moves position
 * between two clients is a segment you cannot compare by eye.
 */
function StatusMix({ rows }: { rows: Integration[] }) {
  const present = useMemo(() => {
    const n: Record<string, number> = {};
    for (const i of rows) n[i.status] = (n[i.status] ?? 0) + 1;
    return STATUSES.filter((st) => n[st] > 0).map((st) => ({
      status: st,
      count: n[st],
      fill: STATUS_COLORS[st].fill,
    }));
  }, [rows]);

  return (
    <div className="k-card min-w-[260px] flex-1 px-4 py-3.5">
      <h2 className="k-eyebrow">Status mix</h2>
      <div className="my-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {present.map((p) => (
          <div key={p.status} style={{ flex: p.count, background: p.fill }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-k-mute">
        {present.map((p) => (
          <li key={p.status}>
            <span className="k-mono">{p.count}</span> {p.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Staleness — how many integrations nobody has touched in a week.
 *
 * The numeral is `--k-text-amber`, not the `--k-fill-warn` amber 1c draws.
 * #F59E0B is a fill: it fails AA as text on white, and
 * tests/design/token-usage.test.ts exists to stop exactly that substitution.
 */
function Staleness({ count }: { count: number }) {
  return (
    <div className="k-card w-[230px] px-4 py-3.5">
      <h2 className="k-eyebrow">Staleness</h2>
      <p
        className={`k-num mt-2 text-[26px] ${
          count > 0 ? "text-k-text-amber" : "text-k-ink-3"
        }`}
      >
        {count}
      </p>
      <p className="mt-1.5 text-[11.5px] text-k-mute">
        item{count === 1 ? "" : "s"} with no update in 7+ days
      </p>
    </div>
  );
}

function IntegrationTable({
  clientId,
  rows,
  canEdit,
  assignees,
}: {
  clientId: string;
  rows: Integration[];
  canEdit: boolean;
  assignees: string[];
}) {
  return (
    // Its own scroll container: the page body must never scroll sideways, and
    // this table has six columns that cannot all fit on a phone.
    <div className="k-card overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
        {/* 1c's column rhythm: 1fr / 130 / 118 / 96 / 92, with Milestones and
            the archive column added — the artboard draws five columns, but
            dropping either of ours would take real data off the screen.
            `table-layout` is auto, so these are hints: a column whose content
            genuinely will not fit still expands rather than clipping. */}
        <colgroup>
          <col />
          <col style={{ width: 130 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 92 }} />
          {canEdit && <col style={{ width: 44 }} />}
        </colgroup>
        <thead>
          <tr className="k-thead">
            <th className="px-4 py-[9px] text-left font-semibold">Integration</th>
            <th className="px-4 py-[9px] text-left font-semibold">Status</th>
            <th className="px-4 py-[9px] text-left font-semibold">Assignee</th>
            <th className="px-4 py-[9px] text-left font-semibold">Due</th>
            <th className="px-4 py-[9px] text-left font-semibold">Milestones</th>
            <th className="px-4 py-[9px] text-left font-semibold">Updated</th>
            {canEdit && <th className="px-4 py-[9px]" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const overdue = isOverdue(i);
            const stale = isStale(i);
            const reason = integRiskReason(i);
            const ms = integMilestoneCounts(i);
            const last = lastUpdateDate(i);

            return (
              <tr key={i.id} className="k-row k-row-hover">
                <td className="px-4 py-[11px]">
                  <Link
                    href={`/integrations/${clientId}/${encodeURIComponent(i.id)}`}
                    className="font-semibold text-k-ink hover:text-k-primary hover:underline"
                  >
                    {i.name}
                  </Link>
                  {reason && (
                    <span
                      className="mt-0.5 flex items-center gap-1 text-[11px] text-k-text-red"
                      title={reason}
                    >
                      <AlertTriangle size={11} strokeWidth={1.5} aria-hidden />
                      {reason}
                    </span>
                  )}
                </td>
                <td className="px-4 py-[11px]">
                  {canEdit ? (
                    <InlineSelect
                      target={{
                        kind: "integration",
                        clientId,
                        id: i.id,
                        path: `/api/integrations/${encodeURIComponent(i.id)}`,
                        screen: "integrations",
                      }}
                      field="status"
                      label={`Status for ${i.name}`}
                      value={i.status}
                      options={STATUSES}
                      version={i._v}
                      before={i}
                    />
                  ) : (
                    <StatusPill status={i.status} size="sm" />
                  )}
                </td>
                <td className="px-4 py-[11px] text-k-ink-3">
                  {canEdit ? (
                    <InlineSelect
                      target={{
                        kind: "integration",
                        clientId,
                        id: i.id,
                        path: `/api/integrations/${encodeURIComponent(i.id)}`,
                        screen: "integrations",
                      }}
                      field="assignee"
                      label={`Assignee for ${i.name}`}
                      value={i.assignee ?? ""}
                      options={assignees}
                      emptyLabel="Unassigned"
                      unknownSuffix="(not a current user)"
                      nullable
                      version={i._v}
                      before={i}
                    />
                  ) : (
                    i.assignee || <span className="text-k-mute">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-[11px]">
                  {i.dueDate ? (
                    // Just the date, per 1c. The days-late count lives on the
                    // risk line under the integration's name — printing it in
                    // both places is what pushed this cell onto three lines and
                    // the row to half again its designed height.
                    <span
                      className={`k-mono whitespace-nowrap text-[11px] ${
                        overdue ? "font-semibold text-k-text-red" : "text-k-ink-3"
                      }`}
                    >
                      {fmtDate(i.dueDate)}
                    </span>
                  ) : (
                    <span className="text-k-mute">—</span>
                  )}
                </td>
                <td className="px-4 py-[11px]">
                  {ms.total === 0 ? (
                    <span className="text-k-mute">—</span>
                  ) : (
                    <span className="k-mono text-[11.5px] text-k-ink-3">
                      {ms.achieved}/{ms.total}
                      {ms.missed > 0 && (
                        <span className="ml-1 text-k-text-red">
                          · {ms.missed} missed
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-[11px]">
                  {last ? (
                    <span
                      className={`k-mono whitespace-nowrap text-[11px] ${
                        stale ? "text-k-text-amber" : "text-k-mute"
                      }`}
                      title={stale ? "No update in over a week" : undefined}
                    >
                      {stale && (
                        <Clock
                          size={11}
                          strokeWidth={1.5}
                          aria-hidden
                          className="mr-1 inline align-[-1px]"
                        />
                      )}
                      {fmtDate(last)}
                    </span>
                  ) : (
                    <span className="text-k-mute">Never</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-4 py-[11px]">
                    <ArchiveButton
                      path={`/api/integrations/${encodeURIComponent(i.id)}`}
                      version={i._v}
                      label={i.name}
                      cascade={
                        ms.total > 0
                          ? `Its ${ms.total} milestone${ms.total === 1 ? "" : "s"} go with it.`
                          : undefined
                      }
                      screen="integrations"
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
