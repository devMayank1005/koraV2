"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Plus } from "lucide-react";
import { useClient } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
import { StatusPill, RagPill } from "@/components/ui/status";
import { ExportMenu } from "@/components/export-menu";
import { toast } from "sonner";
import { InlineSelect } from "@/components/ui/inline";
import { useCanEdit } from "@/lib/query/permissions";
import { AddModuleDialog } from "@/components/create/module-dialog";
import { ActivityFeed } from "@/components/activity-feed";
import {
  PHASES,
  STATUSES,
  SIGNOFF_PHASES,
  shortPhase,
} from "@/lib/domain/constants";
import {
  implProgress,
  implAutoRag,
  canCompletePhase,
  implSignoffCounts,
  projectedGoLive,
  moduleOwner,
  phaseSignedOff,
} from "@/lib/domain/implementation";
import { fmtDate } from "@/lib/utils/dates";
import type { Client, Module, Phase, Status } from "@/lib/domain/types";

/** 1e's cell fills, at the artboard's own alpha. */
const SIGNED_FILL = "rgba(136, 183, 135, .85)";
const WIP_FILL = "rgba(0, 155, 221, .85)";

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
  const [selected, setSelected] = useState<{
    moduleId: string;
    phase: string;
  } | null>(null);
  const [addingModule, setAddingModule] = useState(false);
  const canEditClient = useCanEdit();

  const modules = client?.modules ?? [];
  const progress = client ? implProgress(client) : null;
  const rag = client ? implAutoRag(client) : null;

  const selectedModule = modules.find((m) => m.id === selected?.moduleId);
  const selectedPhase = selectedModule?.phases?.find(
    (p) => p.name === selected?.phase,
  );

  return (
    <div className="flex h-full min-h-0">
      {/* The scroll container and the page measure are two different boxes
          here. Centring has to happen INSIDE the scroller — put `k-page` on
          the overflow element and the margins scroll away with the content. */}
      <div className="min-w-0 flex-1 overflow-auto">
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
                    {/* 1e's meta line. The percentage that used to sit at 26px on
                      the right is now the first stat card, where it is labelled
                      — and it counts SIGNED-OFF phases there, which is the
                      stricter measure and the one the gate enforces. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-k-mute">
                      <span>
                        {modules.length} module{modules.length === 1 ? "" : "s"}
                        {progress && <> · {progress.total} phases</>}
                        {client.masterAssignee && (
                          <>
                            {" "}
                            · PMO{" "}
                            <span className="font-semibold text-k-ink">
                              {client.masterAssignee}
                            </span>
                          </>
                        )}
                      </span>
                      {rag && <RagPill rag={rag} />}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ExportMenu
                      items={[
                        {
                          label: "Implementation Report (PDF)",
                          disabledReason: modules.length
                            ? undefined
                            : "no modules",
                          run: async () => {
                            const { exportImplementationPdf } =
                              await import("@/lib/export/implementation-pdf");
                            await exportImplementationPdf(client);
                            toast.success("Report downloaded.");
                          },
                        },
                        {
                          label: "Excel (Implementation)",
                          disabledReason: modules.length
                            ? undefined
                            : "no modules",
                          run: async () => {
                            const { exportClientExcel } =
                              await import("@/lib/export/excel");
                            await exportClientExcel("impl", client);
                            toast.success("Spreadsheet downloaded.");
                          },
                        },
                      ]}
                    />
                    {canEditClient && (
                      <button
                        type="button"
                        className="k-btn k-btn-primary k-btn-sm"
                        onClick={() => setAddingModule(true)}
                      >
                        <Plus size={13} strokeWidth={1.5} aria-hidden />
                        Module
                      </button>
                    )}
                  </div>
                </header>

                <AddModuleDialog
                  clientId={clientId}
                  clientName={client.name}
                  open={addingModule}
                  onOpenChange={setAddingModule}
                />

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
                    client={client}
                    modules={modules}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
              </>
            )}
          </QueryState>
        </div>
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
  client,
  modules,
  selected,
  onSelect,
}: {
  client: Client;
  modules: Module[];
  selected: { moduleId: string; phase: string } | null;
  onSelect: (s: { moduleId: string; phase: string }) => void;
}) {
  const counts = implSignoffCounts(client);
  const goLive = projectedGoLive(client);
  const signedPct = counts.total
    ? Math.round((counts.signedOff / counts.total) * 100)
    : 0;

  return (
    <>
      <div className="mt-5 overflow-x-auto">
        <div className="k-card min-w-[900px] overflow-hidden">
          {/* Header row on --surface, per 1e. Names wrap rather than rotate and
              each carries its full name as a title for the ones that truncate. */}
          <div
            className="grid border-b border-k-line bg-k-surface"
            style={{ gridTemplateColumns: "150px repeat(9, 1fr)" }}
          >
            <div className="k-eyebrow px-3 py-2.5">Module</div>
            {PHASES.map((p) => (
              <div
                key={p}
                className="border-l border-k-line px-1 py-2.5 text-center text-[9.5px] font-semibold uppercase leading-[1.25] tracking-[.03em] text-k-mute"
                title={p}
              >
                {shortPhase(p)}
                {SIGNOFF_PHASES.includes(p) && (
                  <span
                    className="ml-0.5 text-k-text-amber"
                    title="Requires a signed document"
                  >
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
            const owner = moduleOwner(m);
            return (
              <div
                key={m.id}
                className="grid border-b border-k-line-2 last:border-b-0"
                style={{ gridTemplateColumns: "150px repeat(9, 1fr)" }}
              >
                <div className="min-w-0 px-3 py-2.5">
                  <p
                    className="truncate text-[12.5px] font-semibold text-k-ink"
                    title={m.name}
                  >
                    {m.name}
                  </p>
                  {/* 1e labels this "owner". `Module` has no owner column, so
                      this is the current phase's assignee and says so. */}
                  <p
                    className="truncate text-[10.5px] text-k-mute-2"
                    title={owner ? `On the live phase: ${owner}` : undefined}
                  >
                    {owner ?? "Unassigned"}
                  </p>
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
        </div>
      </div>

      <Legend />

      {/* The asterisk needs saying out loud. It marks the three phases that
          cannot be completed without a signed document attached — a real
          constraint the server enforces, not decoration — and a marker whose
          only explanation is a hover title is a marker most people never
          read. */}
      <p className="mt-2 text-[11px] text-k-mute">
        <span className="text-k-text-amber">*</span> requires a signed document
        attached to an update before it can be completed
      </p>

      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        <Stat
          value={`${signedPct}%`}
          label={`${counts.signedOff} of ${counts.total} phases signed off`}
        />
        <Stat
          value={counts.atRiskOrDelayed}
          label="phases at risk or delayed"
          tone={counts.atRiskOrDelayed > 0 ? "text-k-text-red" : undefined}
        />
        <Stat
          value={goLive ? fmtDate(goLive) : "—"}
          label="projected go-live"
          tone="text-k-text-amber"
          small
        />
      </div>
    </>
  );
}

/**
 * The cell states, spelled out.
 *
 * A glyph is a weaker signal than a block of colour, so the legend is not
 * optional decoration here — without it the grid is unreadable to anyone who
 * has not been told what `~` means.
 */
const LEGEND: { mark: string; fill: string; label: string }[] = [
  { mark: "✓", fill: SIGNED_FILL, label: "Signed off" },
  { mark: "•", fill: WIP_FILL, label: "In progress" },
  { mark: "!", fill: "var(--k-fill-risk)", label: "At risk" },
  { mark: "~", fill: "var(--k-fill-warn)", label: "Delayed" },
  { mark: "", fill: "var(--k-line-2)", label: "Not started" },
];

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-k-mute">
      {LEGEND.map((l) => (
        <li key={l.label} className="flex items-center gap-1.5">
          {/* The swatch carries the GLYPH, not just the colour. A row of empty
              tinted squares would leave `~` and `!` unexplained, which is the
              whole reason the legend is here now that the cells no longer
              carry a block of colour. */}
          <span
            aria-hidden
            className="k-mono inline-flex h-[13px] w-[13px] items-center justify-center rounded-[2px] text-[10px] font-bold leading-none"
            style={{
              background: l.mark ? "transparent" : l.fill,
              boxShadow: l.mark ? undefined : "inset 0 0 0 1px var(--k-line)",
              color: l.fill,
            }}
          >
            {l.mark}
          </span>
          {l.label}
        </li>
      ))}
    </ul>
  );
}

function Stat({
  value,
  label,
  tone,
  small,
}: {
  value: React.ReactNode;
  label: string;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className="k-card px-4 py-3.5">
      <p
        className={`k-num ${small ? "text-[18px]" : "text-[24px]"} ${tone ?? ""}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-k-mute">{label}</p>
    </div>
  );
}

/**
 * What a cell shows. Null means "no row for this phase" — a data problem, not a
 * status, and drawn differently from Not Started so the two cannot be confused.
 *
 * SIGNED OFF IS NOT `status === "Completed"`. A sign-off phase completed with no
 * document attached is not signed off, and `phaseSignedOff` asks the same
 * question the server asks before it will accept the write.
 */
function cellMark(
  phase: Phase | undefined,
): { glyph: string; color: string } | null {
  if (!phase) return null;
  if (phaseSignedOff(phase)) return { glyph: "✓", color: SIGNED_FILL };
  if (phase.status === "At Risk")
    return { glyph: "!", color: "var(--k-fill-risk)" };
  if (phase.status === "Delayed")
    return { glyph: "~", color: "var(--k-fill-warn)" };
  if (phase.status === "Not Started") return { glyph: "", color: "" };
  return { glyph: "•", color: WIP_FILL };
}

/**
 * One cell.
 *
 * A button, not a div: this is the primary way to move around the matrix, and
 * making it keyboard-reachable is the difference between a grid you can use and
 * a picture of one. The status is carried in the accessible name too — with the
 * colour block replaced by a glyph, that name is now the only place the status
 * is stated in words.
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
  const mark = cellMark(phase);
  const empty = mark !== null && mark.glyph === "";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${phase ? status : "not present"}`}
      aria-pressed={selected}
      title={`${label} — ${phase ? status : "not present"}`}
      className="flex min-h-9 w-full items-center justify-center border-l border-k-line transition-[filter] hover:brightness-95"
      style={{
        background: empty ? "var(--k-line-2)" : undefined,
        // A missing phase is a data problem, not a status. It reads as a dashed
        // hairline so it cannot be mistaken for "Not Started".
        boxShadow:
          mark === null ? "inset 0 0 0 1px var(--k-line-2)" : undefined,
        outline: selected ? "2px solid var(--k-primary)" : undefined,
        outlineOffset: selected ? "-2px" : undefined,
      }}
    >
      {mark && mark.glyph && (
        <span
          aria-hidden
          className="k-mono text-[10px] font-bold leading-none"
          style={{ color: mark.color }}
        >
          {mark.glyph}
        </span>
      )}
    </button>
  );
}

/**
 * The persistent phase panel (artboard 1e).
 *
 * `xl` rather than `lg`: this app keeps its 268px client rail on the
 * Implementation screen, which the artboard does not draw. Sidebar + rail +
 * panel is 800px of chrome, so below 1280px the nine-column grid would be
 * squeezed under 40px a cell. Under that width the panel is absent and the
 * "Open phase" route is how you read a phase — the same fallback the rail
 * itself uses below 768px.
 */
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
  const canEdit = useCanEdit();
  const [logging, setLogging] = useState(false);
  const phaseTarget = phase
    ? {
        kind: "phase" as const,
        clientId,
        id: phase.id,
        path: `/api/phases/${encodeURIComponent(phase.id)}`,
        screen: "implementation",
      }
    : undefined;

  const owner = moduleOwner(module);
  const latest = phase?.updates?.[0];

  return (
    <aside
      className="hidden shrink-0 overflow-y-auto border-l border-k-line bg-k-paper p-5 xl:block"
      style={{ width: "var(--k-side-panel)" }}
      aria-label="Phase detail"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="k-eyebrow">Selected phase</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close phase detail"
          className="k-btn k-btn-ghost k-btn-sm !px-1.5"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* The FULL name here — the shortening exists only because a 1/9th grid
          column cannot hold it, and this column is 300px. */}
      <h2 className="mt-2 text-[18px] font-bold leading-tight text-k-primary">
        {phaseName}
      </h2>
      <p className="mt-1 text-[12px] text-k-mute">
        {module.name}
        {owner && <> · {owner}</>}
      </p>

      {!phase ? (
        <p className="mt-4 text-[12px] text-k-mute">
          This module has no row for this phase.
        </p>
      ) : (
        <>
          <div className="mt-3">
            {canEdit ? (
              <InlineSelect
                target={phaseTarget!}
                field="status"
                label={`Status for ${phaseName}`}
                value={phase.status}
                options={STATUSES}
                version={phase._v}
                before={phase}
                // THE SIGNOFF GATE, shown before it is hit rather than after.
                // v1 offered Completed freely and answered with a red toast
                // that vanished in 3.5 seconds — after it had already written
                // the form's other values into local state and not reverted
                // them, so the user's typed dates were silently stranded.
                //
                // 1e draws a static pill here. It stays a select for editors:
                // this is where the gate surfaces, and changing a status
                // without losing the grid is what the panel is for. Viewers get
                // the pill the artboard draws.
                optionDisabled={(o) => o === "Completed" && !!gate && !gate.ok}
                hint={gate && !gate.ok ? gate.reason : undefined}
              />
            ) : (
              <StatusPill status={phase.status} />
            )}
          </div>

          {/* 1e's read-only list. The four inline editors that used to live
              here (start date, current activity, next action, assignee) are all
              on the full phase page, one click away. 1e also lists "Open
              defects"; there is no defect model anywhere in the schema, so that
              row is dropped rather than shown permanently empty. */}
          <dl className="mt-4">
            <PanelField label="Owner">
              {phase.assignee || <span className="text-k-mute">—</span>}
            </PanelField>
            <PanelField label="Target date">
              {phase.targetDate ? (
                <span className="k-mono text-[11.5px]">
                  {fmtDate(phase.targetDate)}
                </span>
              ) : (
                <span className="text-k-mute">—</span>
              )}
            </PanelField>
            <PanelField label="Signed off">
              {phaseSignedOff(phase) ? (
                <span className="text-k-text-green">Yes</span>
              ) : (
                <span className="text-k-mute">No</span>
              )}
            </PanelField>
          </dl>

          <h3 className="k-eyebrow mt-5">Latest update</h3>
          {latest ? (
            <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-k-ink-3">
              {latest.update}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-k-mute">
              No progress notes on this phase.
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Link
              href={`/implementation/${clientId}/${module.id}/${encodeURIComponent(phaseName)}`}
              className="k-btn k-btn-primary k-btn-sm flex-1 justify-center"
            >
              Open phase
            </Link>
            {canEdit && !logging && (
              <button
                type="button"
                className="k-btn k-btn-outline k-btn-sm"
                onClick={() => setLogging(true)}
              >
                Log update
              </button>
            )}
          </div>

          {/* Supplying all three parents is what makes the feed writable, so
              the composer only exists once "Log update" has been pressed. */}
          {logging && (
            <div className="mt-4">
              <ActivityFeed
                entries={phase.updates ?? []}
                variant="compact"
                limit={3}
                emptyHint="No progress notes on this phase."
                parentKind="phase"
                parentId={phase.id}
                clientId={clientId}
              />
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function PanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-k-line-2 py-2.5 last:border-b-0">
      <dt className="text-[11.5px] text-k-mute">{label}</dt>
      <dd className="min-w-0 truncate text-[12px] font-semibold text-k-ink">
        {children}
      </dd>
    </div>
  );
}
