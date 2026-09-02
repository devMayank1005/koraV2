"use client";

import Link from "next/link";
import { ChevronLeft, Lock, Check } from "lucide-react";
import { useClient } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/status";
import { InlineSelect, InlineText } from "@/components/ui/inline";
import { useCanEdit, useAssigneeOptions } from "@/lib/query/permissions";
import { ActivityFeed } from "@/components/activity-feed";
import {
  PHASES,
  STATUSES,
  STATUS_COLORS,
  SIGNOFF_PHASES,
} from "@/lib/domain/constants";
import { canCompletePhase } from "@/lib/domain/implementation";
import { fmtDate } from "@/lib/utils/dates";
import type { Phase, Status } from "@/lib/domain/types";

/**
 * Phase detail (artboard 1f): `1fr 250px`, with the nine-step track across the
 * top.
 *
 * THE TRACK SHOWS WHERE THIS PHASE SITS IN THE FIXED SEQUENCE, which is the
 * question the old app's phase page could not answer — it showed one phase in
 * isolation, so "is CRP Signoff before or after UAT" meant going back to the
 * matrix. The nine names are a constant, not derived from the data, so the
 * track is identical on every phase of every module.
 */
export function PhaseDetailView({
  clientId,
  moduleId,
  phaseName,
}: {
  clientId: string;
  moduleId: string;
  phaseName: string;
}) {
  const query = useClient(clientId);
  const client = query.data;
  const mod = client?.modules?.find((m) => m.id === moduleId);
  const phase = mod?.phases?.find((p) => p.name === phaseName);
  const canEdit = useCanEdit();
  const assignees = useAssigneeOptions(phase?.assignee);
  const target = phase
    ? {
        kind: "phase" as const,
        clientId,
        id: phase.id,
        path: `/api/phases/${encodeURIComponent(phase.id)}`,
        screen: "implementation",
      }
    : undefined;

  return (
    <div className="p-7">
      <QueryState
        isPending={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        skeletonRows={7}
      >
        {!mod ? (
          <EmptyState
            title="That module is no longer here"
            hint="It may have been archived."
          />
        ) : (
          <>
            <Link
              href={`/implementation/${clientId}`}
              className="mb-3 inline-flex items-center gap-1 text-[12px] text-k-mute hover:text-k-primary"
            >
              <ChevronLeft size={13} strokeWidth={1.5} aria-hidden />
              {client?.name ?? "Back"} · {mod.name}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="k-page-title min-w-0">{phaseName}</h1>
              {phase &&
                (canEdit && target ? (
                  <div className="w-[200px]">
                    <InlineSelect
                      target={target}
                      field="status"
                      label={`Status for ${phaseName}`}
                      value={phase.status}
                      options={STATUSES}
                      version={phase._v}
                      before={phase}
                      optionDisabled={(o) =>
                        o === "Completed" && !canCompletePhase(phase).ok
                      }
                    />
                  </div>
                ) : (
                  <StatusPill status={phase.status} />
                ))}
            </header>

            <PhaseTrack
              clientId={clientId}
              moduleId={moduleId}
              current={phaseName}
              phases={mod.phases ?? []}
            />

            {!phase ? (
              <div className="mt-6">
                <EmptyState
                  title="This module has no row for this phase"
                  hint="Every module should carry all nine. This one is missing."
                />
              </div>
            ) : (
              <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_250px]">
                <div className="min-w-0 space-y-5">
                  <SignoffNotice phase={phase} />

                  <section className="k-card p-4">
                    <div className="k-card-head">
                      <h2 className="k-card-title">Updates</h2>
                      <span className="k-mono text-[11px] text-k-mute">
                        {phase.updates?.length ?? 0}
                      </span>
                    </div>
                    <div className="mt-3">
                      <ActivityFeed
                        entries={phase.updates ?? []}
                        parentKind="phase"
                        parentId={phase.id}
                        clientId={clientId}
                      />
                    </div>
                  </section>
                </div>

                <aside className="space-y-5">
                  <section className="k-card p-4">
                    <h2 className="k-card-title">Detail</h2>
                    <dl className="mt-3 space-y-2.5">
                      <F label="Assignee">
                        {canEdit && target ? (
                          <InlineSelect
                            target={target}
                            field="assignee"
                            label="Assignee"
                            value={phase.assignee ?? ""}
                            options={assignees}
                            version={phase._v}
                            before={phase}
                            emptyLabel="Unassigned"
                            unknownSuffix="(not a current user)"
                          />
                        ) : (
                          phase.assignee || <Dash />
                        )}
                      </F>
                      <F label="Start">
                        {canEdit && target ? (
                          <InlineText
                            target={target}
                            field="startDate"
                            kind="date"
                            label="Start date"
                            value={phase.startDate ?? ""}
                            version={phase._v}
                            before={phase}
                            nullable
                            format={fmtDate}
                          />
                        ) : phase.startDate ? (
                          fmtDate(phase.startDate)
                        ) : (
                          <Dash />
                        )}
                      </F>
                      <F label="Target">
                        {canEdit && target ? (
                          <InlineText
                            target={target}
                            field="targetDate"
                            kind="date"
                            label="Target date"
                            value={phase.targetDate ?? ""}
                            version={phase._v}
                            before={phase}
                            nullable
                            format={fmtDate}
                          />
                        ) : phase.targetDate ? (
                          fmtDate(phase.targetDate)
                        ) : (
                          <Dash />
                        )}
                      </F>
                      <F label="Current activity">
                        {canEdit && target ? (
                          <InlineText
                            target={target}
                            field="currentActivity"
                            kind="textarea"
                            label="Current activity"
                            value={phase.currentActivity ?? ""}
                            version={phase._v}
                            before={phase}
                          />
                        ) : (
                          phase.currentActivity || <Dash />
                        )}
                      </F>
                      <F label="Next action">
                        {canEdit && target ? (
                          <InlineText
                            target={target}
                            field="nextAction"
                            kind="textarea"
                            label="Next action"
                            value={phase.nextAction ?? ""}
                            version={phase._v}
                            before={phase}
                          />
                        ) : (
                          phase.nextAction || <Dash />
                        )}
                      </F>
                    </dl>
                  </section>
                </aside>
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

/**
 * The nine-step track.
 *
 * Built from the PHASES constant rather than from `module.phases`, so a module
 * with a missing row still shows all nine steps with a gap where the row should
 * be — the alternative silently renumbers the sequence.
 */
function PhaseTrack({
  clientId,
  moduleId,
  current,
  phases,
}: {
  clientId: string;
  moduleId: string;
  current: string;
  phases: Phase[];
}) {
  const byName = new Map(phases.map((p) => [p.name, p] as const));

  return (
    <nav aria-label="Phase sequence" className="mt-4 overflow-x-auto">
      <ol className="flex min-w-[820px] items-stretch gap-1">
        {PHASES.map((name, i) => {
          const p = byName.get(name);
          const status = (p?.status ?? "Not Started") as Status;
          const c = STATUS_COLORS[status] ?? STATUS_COLORS["Not Started"];
          const isCurrent = name === current;
          const done = status === "Completed";

          return (
            <li key={name} className="min-w-0 flex-1">
              <Link
                href={`/implementation/${clientId}/${moduleId}/${encodeURIComponent(name)}`}
                aria-current={isCurrent ? "step" : undefined}
                title={`${name} — ${p ? status : "not present"}`}
                className={`block rounded-[4px] px-1.5 py-1.5 transition-colors ${
                  isCurrent ? "bg-k-primary/[.10]" : "hover:bg-k-surface"
                }`}
              >
                <span
                  aria-hidden
                  className="block rounded-[2px]"
                  style={{ height: 4, background: p ? c.fill : "var(--k-line-2)" }}
                />
                <span
                  className={`mt-1.5 flex items-start gap-1 text-[10px] leading-tight ${
                    isCurrent
                      ? "font-semibold text-k-primary"
                      : "text-k-mute"
                  }`}
                >
                  {done && (
                    <Check size={9} strokeWidth={2} aria-hidden className="mt-px shrink-0" />
                  )}
                  <span className="min-w-0">
                    {i + 1}. {name}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The signoff gate, stated before anyone tries to complete the phase.
 *
 * BPU/CRP/UAT Signoff cannot be completed without a document attached to an
 * update. That rule lived only in js/events.js in the old app, which meant it
 * was advisory — any direct API call could complete a signoff phase with
 * nothing attached. It is enforced server-side now, and shown here from the
 * same domain function, so the screen and the server cannot disagree.
 */
function SignoffNotice({ phase }: { phase: Phase }) {
  if (!SIGNOFF_PHASES.includes(phase.name)) return null;

  const gate = canCompletePhase({ ...phase, status: "Completed" } as Phase);
  const satisfied = gate.ok;

  return (
    <div
      className="k-callout flex items-start gap-2.5"
      style={
        satisfied
          ? { background: "var(--k-tint-green)", borderColor: "transparent" }
          : undefined
      }
    >
      {satisfied ? (
        <Check size={15} strokeWidth={1.5} className="mt-px shrink-0 text-k-text-green" />
      ) : (
        <Lock size={15} strokeWidth={1.5} className="mt-px shrink-0 text-k-text-amber" />
      )}
      <p className="text-[12px] text-k-ink-3">
        {satisfied
          ? "Signed document attached — this phase can be completed."
          : "This is a sign-off phase. It cannot be marked Completed until an update carries the signed document."}
      </p>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="k-eyebrow">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-[12px] text-k-ink-3">
        {children}
      </dd>
    </div>
  );
}

function Dash() {
  return <span className="text-k-mute">—</span>;
}
