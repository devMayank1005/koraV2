"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useClient } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
import { StatusPill, RagPill } from "@/components/ui/status";
import { ActivityFeed } from "@/components/activity-feed";
import { PHASES, STATUS_COLORS, SIGNOFF_PHASES } from "@/lib/domain/constants";
import { implProgress, implAutoRag, canCompletePhase } from "@/lib/domain/implementation";
import { fmtDate } from "@/lib/utils/dates";
import type { Module, Phase, Status } from "@/lib/domain/types";

/**
 * The implementation matrix (artboard 1e): modules down, the nine fixed phases
 * across, with a persistent 300px side panel.
 *
 * THE GRID IS `150px repeat(9, 1fr)` AND THE NINE COLUMNS ARE FIXED. Every
 * module has exactly nine phases — the API creates them together in one
 * transaction for precisely this reason — so the grid is indexed by phase NAME
 * rather than by whatever a module happens to contain. A module missing a row
 * renders as an empty cell in the right column instead of shifting all the
 * others left, which is what an `array.map` would do and what would make the
 * whole grid silently wrong.
 *
 * THE SIDE PANEL IS NEW IN THE RESKIN. The old app navigated away to a full
 * page for every cell, which meant losing the matrix to read one phase and
 * going back to compare. Selecting a cell here fills the panel and leaves the
 * grid in place; the full page still exists behind a link, for deep-linking and
 * for the activity feed at full width.
 */
export function ImplementationMatrixView({ clientId }: { clientId: string }) {
  const query = useClient(clientId);
  const client = query.data;
  const [selected, setSelected] = useState<{ moduleId: string; phase: string } | null>(
    null,
  );

  const modules = client?.modules ?? [];
  const progress = client ? implProgress(client) : null;
  const rag = client ? implAutoRag(client) : null;

  const selectedModule = modules.find((m) => m.id === selected?.moduleId);
  const selectedPhase = selectedModule?.phases?.find(
    (p) => p.name === selected?.phase,
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-auto p-7">
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
                  {progress && (
                    <p className="mt-1 text-[12.5px] text-k-mute">
                      {progress.completed} of {progress.total} phases complete
                      {progress.atRisk > 0 && (
                        <span className="text-k-text-red">
                          {" "}
                          · {progress.atRisk} at risk
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {progress && (
                    <span className="k-num text-[26px] leading-none">
                      {progress.pct}%
                    </span>
                  )}
                  {rag && <RagPill rag={rag} />}
                </div>
              </header>

              {modules.length === 0 ? (
                <div className="mt-5">
                  {/* The null-sentinel case: in the domain, nothing in it yet.
                      Six real clients are in exactly this state, and they are
                      the reason migration 0003 exists. */}
                  <EmptyState
                    title="No modules yet"
                    hint="This client is in the Implementation tracker but has no modules. Add one to start the nine-phase grid."
                  />
                </div>
              ) : (
                <Matrix
                  modules={modules}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
            </>
          )}
        </QueryState>
      </div>

      {selected && selectedModule && (
        <SidePanel
          clientId={clientId}
          module={selectedModule}
          phaseName={selected.phase}
          phase={selectedPhase}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Matrix({
  modules,
  selected,
  onSelect,
}: {
  modules: Module[];
  selected: { moduleId: string; phase: string } | null;
  onSelect: (s: { moduleId: string; phase: string }) => void;
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <div className="min-w-[900px]">
        {/* Header row. The phase names are long and the columns are narrow, so
            they are rotated-free but wrapped, and each carries its full name as
            a title for the ones that still truncate. */}
        <div
          className="grid gap-px border-b border-k-line"
          style={{ gridTemplateColumns: "150px repeat(9, 1fr)" }}
        >
          <div className="k-eyebrow px-2 py-2">Module</div>
          {PHASES.map((p) => (
            <div key={p} className="k-eyebrow px-1 py-2 leading-tight" title={p}>
              {p}
              {SIGNOFF_PHASES.includes(p) && (
                <span className="ml-0.5 text-k-text-amber" title="Requires a signed document">
                  *
                </span>
              )}
            </div>
          ))}
        </div>

        {modules.map((m) => {
          // Indexed by NAME, never by position — see the note above.
          const byName = new Map(
            (m.phases ?? []).map((p) => [p.name, p] as const),
          );
          return (
            <div
              key={m.id}
              className="grid gap-px border-b border-k-line-2"
              style={{ gridTemplateColumns: "150px repeat(9, 1fr)" }}
            >
              <div
                className="truncate px-2 py-2 text-[12.5px] font-semibold text-k-ink"
                title={m.name}
              >
                {m.name}
              </div>
              {PHASES.map((name) => {
                const phase = byName.get(name);
                const isSelected =
                  selected?.moduleId === m.id && selected?.phase === name;
                return (
                  <Cell
                    key={name}
                    phase={phase}
                    label={`${m.name} — ${name}`}
                    selected={isSelected}
                    onClick={() => onSelect({ moduleId: m.id, phase: name })}
                  />
                );
              })}
            </div>
          );
        })}

        {/* The asterisk needs saying out loud. It marks the three phases that
            cannot be completed without a signed document attached — a real
            constraint the server enforces, not decoration — and a marker whose
            only explanation is a hover title is a marker most people never
            read. */}
        <p className="mt-3 text-[11px] text-k-mute">
          <span className="text-k-text-amber">*</span> requires a signed
          document attached to an update before it can be completed
        </p>
      </div>
    </div>
  );
}

/**
 * One cell.
 *
 * A button, not a div: this is the primary way to move around the matrix, and
 * making it keyboard-reachable is the difference between a grid you can use and
 * a picture of one. The status is carried in the accessible name too — colour
 * alone is not a signal.
 */
function Cell({
  phase,
  label,
  selected,
  onClick,
}: {
  phase: Phase | undefined;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const status = (phase?.status ?? "Not Started") as Status;
  const c = STATUS_COLORS[status] ?? STATUS_COLORS["Not Started"];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${phase ? status : "not present"}`}
      aria-pressed={selected}
      title={`${label} — ${phase ? status : "not present"}`}
      className={`h-9 w-full rounded-[4px] transition-[box-shadow,opacity] hover:opacity-80 ${
        selected ? "ring-2 ring-k-primary" : ""
      }`}
      style={{
        background: phase ? c.tint : "transparent",
        // A missing phase is a data problem, not a status. It reads as an
        // outline so it cannot be mistaken for "Not Started".
        boxShadow: phase ? undefined : "inset 0 0 0 1px var(--k-line-2)",
      }}
    >
      <span
        aria-hidden
        className="mx-auto block rounded-full"
        style={{ width: 7, height: 7, background: phase ? c.fill : "transparent" }}
      />
    </button>
  );
}

/** The persistent 300px detail panel. */
function SidePanel({
  clientId,
  module,
  phaseName,
  phase,
  onClose,
}: {
  clientId: string;
  module: Module;
  phaseName: string;
  phase: Phase | undefined;
  onClose: () => void;
}) {
  // The gate is evaluated for display, exactly as the server evaluates it for
  // enforcement — one definition, so the panel can never promise something the
  // API would refuse.
  const gate = phase ? canCompletePhase(phase) : null;

  return (
    <aside
      className="hidden shrink-0 overflow-y-auto border-l border-k-line bg-k-paper p-4 lg:block"
      style={{ width: 300 }}
      aria-label="Phase detail"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="k-eyebrow">{module.name}</p>
          <h2 className="mt-0.5 text-[14px] font-semibold text-k-ink">
            {phaseName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close phase detail"
          className="k-btn k-btn-ghost k-btn-sm !px-1.5"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {!phase ? (
        <p className="mt-4 text-[12px] text-k-mute">
          This module has no row for this phase.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <StatusPill status={phase.status} />
          </div>

          {gate && !gate.ok && (
            <p className="k-callout mt-3 text-[11.5px]">{gate.reason}</p>
          )}

          <dl className="mt-4 space-y-2.5">
            <PanelField label="Assignee" value={phase.assignee} />
            <PanelField
              label="Start"
              value={phase.startDate ? fmtDate(phase.startDate) : undefined}
            />
            <PanelField
              label="Target"
              value={phase.targetDate ? fmtDate(phase.targetDate) : undefined}
            />
            <PanelField label="Current activity" value={phase.currentActivity} />
            <PanelField label="Next action" value={phase.nextAction} />
          </dl>

          <div className="mt-5">
            <h3 className="k-eyebrow mb-2">Recent updates</h3>
            <ActivityFeed
              entries={phase.updates ?? []}
              variant="compact"
              limit={4}
              emptyHint="No progress notes on this phase."
            />
          </div>

          <Link
            href={`/implementation/${clientId}/${module.id}/${encodeURIComponent(phaseName)}`}
            className="k-btn k-btn-outline k-btn-sm mt-5 w-full justify-center"
          >
            Open full phase
          </Link>
        </>
      )}
    </aside>
  );
}

function PanelField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="k-eyebrow">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-[12px] text-k-ink-3">
        {value || <span className="text-k-mute">—</span>}
      </dd>
    </div>
  );
}
