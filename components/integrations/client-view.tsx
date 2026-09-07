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
  daysOverdue,
  isStale,
  integRiskReason,
  integMilestoneCounts,
  lastUpdateDate,
} from "@/lib/domain/integrations";
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

  return (
    <div className="p-7">
      <QueryState
        isPending={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        skeletonRows={8}
      >
        {client && (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="k-page-title truncate">{client.name}</h1>
                <p className="mt-1 flex items-center gap-2 text-[12.5px] text-k-mute">
                  {all.length} integration{all.length === 1 ? "" : "s"}
                  {client.masterAssignee && <> · Lead: {client.masterAssignee}</>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {integRagLabel(client) && (
                  <RagPill rag={integRagLabel(client)!} />
                )}
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
              <div
                className="mt-4 flex flex-wrap gap-1.5"
                role="group"
                aria-label="Filter by status"
              >
                <Chip
                  label="All"
                  count={counts.all}
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                />
                {Object.keys(counts)
                  .filter((k) => k !== "all")
                  .sort()
                  .map((status) => (
                    <Chip
                      key={status}
                      label={status}
                      count={counts[status]}
                      active={filter === status}
                      onClick={() => setFilter(status)}
                    />
                  ))}
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
          </>
        )}
      </QueryState>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
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
      <span className="k-mono ml-1.5 text-[10px] text-k-mute">{count}</span>
    </button>
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
        <thead>
          <tr className="k-thead">
            <th className="px-3 py-2 text-left font-semibold">Integration</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-left font-semibold">Assignee</th>
            <th className="px-3 py-2 text-left font-semibold">Due</th>
            <th className="px-3 py-2 text-left font-semibold">Milestones</th>
            <th className="px-3 py-2 text-left font-semibold">Last update</th>
            {canEdit && <th className="w-[44px] px-3 py-2" />}
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
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5 text-k-ink-3">
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
                <td className="px-3 py-2.5">
                  {i.dueDate ? (
                    <span
                      className={`k-mono text-[11.5px] ${
                        overdue ? "font-semibold text-k-text-red" : "text-k-ink-3"
                      }`}
                    >
                      {fmtDate(i.dueDate)}
                      {overdue && (
                        <span className="ml-1 font-normal">
                          ({daysOverdue(i)}d late)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-k-mute">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5">
                  {last ? (
                    <span
                      className={`k-mono text-[11.5px] ${
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
                  <td className="px-3 py-2.5">
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
