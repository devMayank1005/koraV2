"use client";

import Link from "next/link";
import { ArrowRight, X, Zap } from "lucide-react";
import { StatusPill } from "@/components/ui/status";
import { InlineSelect } from "@/components/ui/inline";
import { useCanEdit, useAssigneeOptions } from "@/lib/query/permissions";
import { fmtDate } from "@/lib/utils/dates";
import { STATUSES } from "@/lib/domain/constants";
import {
  isOverdue,
  daysOverdue,
  integMilestoneCounts,
  lastUpdateDate,
} from "@/lib/domain/integrations";
import type { Integration } from "@/lib/domain/types";

/**
 * One integration, beside the table rather than instead of it.
 *
 * Reading a record used to mean a full-route navigation to `[integId]`, which
 * threw away the list you were reading it against — the same mistake the
 * implementation matrix already fixed with its phase panel, and this is
 * deliberately built to that shape.
 *
 * A SUMMARY, NOT THE RECORD. The full page keeps everything that needs room:
 * milestone editing, the update composer, attachments. What is here is what you
 * want while comparing rows — the two fields the table has never shown
 * (`nextAction` and `description`), the numbers, and the last few updates —
 * with one link out. Rebuilding milestone management at 320px would be a second
 * implementation of rules that already exist in one place.
 *
 * Status and assignee stay editable, exactly as they are in the row and in the
 * phase panel, through the same `useUpdateEntity` path.
 */
export function IntegrationPanel({
  clientId,
  integration,
  onClose,
}: {
  clientId: string;
  integration: Integration;
  onClose: () => void;
}) {
  const canEdit = useCanEdit();
  const assignees = useAssigneeOptions(integration.assignee);

  const ms = integMilestoneCounts(integration);
  const last = lastUpdateDate(integration);
  const overdue = isOverdue(integration);
  const target = {
    kind: "integration" as const,
    clientId,
    id: integration.id,
    path: `/api/integrations/${encodeURIComponent(integration.id)}`,
    screen: "integrations" as const,
  };

  // Three, not all of them. The feed on the full page is the place to read a
  // history; this is here to answer "is anyone on it".
  const recent = (integration.timeline ?? []).slice(0, 3);

  return (
    // Width comes from SplitPane's rail, which owns the drag; taking a width
    // prop as well would give the pane two sources of truth for one number.
    <aside className="k-card p-4" aria-label="Integration detail">
      <div className="flex items-start justify-between gap-2">
        <p className="k-eyebrow">Selected integration</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close integration detail"
          className="k-btn k-btn-ghost k-btn-sm !px-1.5"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      <h2 className="mt-2 text-[16px] font-bold leading-tight text-k-primary">
        {integration.name}
      </h2>
      {integration.description && (
        <p className="mt-1 text-[12px] leading-[1.55] text-k-mute">
          {integration.description}
        </p>
      )}

      {/* The one thing a status cannot tell you: what happens next. It is a
          real field on every integration and the table has never had room for
          it, which is most of why opening a record was worth a navigation. */}
      {integration.nextAction && (
        <section className="k-callout mt-3.5">
          <h3 className="k-eyebrow flex items-center gap-1.5">
            <Zap size={12} strokeWidth={1.5} aria-hidden />
            Next action
          </h3>
          <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-[1.55] text-k-ink-3">
            {integration.nextAction}
          </p>
        </section>
      )}

      <dl className="mt-4">
        <PanelField label="Status">
          {canEdit ? (
            <InlineSelect
              target={target}
              field="status"
              label={`Status for ${integration.name}`}
              value={integration.status}
              options={STATUSES}
              version={integration._v}
              before={integration}
            />
          ) : (
            <StatusPill status={integration.status} size="sm" />
          )}
        </PanelField>

        <PanelField label="Assignee">
          {canEdit ? (
            <InlineSelect
              target={target}
              field="assignee"
              label={`Assignee for ${integration.name}`}
              value={integration.assignee ?? ""}
              options={assignees}
              emptyLabel="Unassigned"
              unknownSuffix="(not a current user)"
              nullable
              version={integration._v}
              before={integration}
            />
          ) : (
            integration.assignee || <span className="text-k-mute">Unassigned</span>
          )}
        </PanelField>

        <PanelField label="Due date">
          {integration.dueDate ? (
            <span
              className={`k-mono text-[11.5px] ${overdue ? "font-semibold text-k-text-red" : ""}`}
            >
              {fmtDate(integration.dueDate)}
              {overdue && (
                <span className="ml-1.5 font-semibold">
                  {daysOverdue(integration)}d late
                </span>
              )}
            </span>
          ) : (
            <span className="text-k-mute">—</span>
          )}
        </PanelField>

        <PanelField label="Effort load">
          {integration.effortWeight != null ? (
            <span className="k-mono text-[11.5px]">
              {integration.effortWeight}
            </span>
          ) : (
            <span className="text-k-mute">—</span>
          )}
        </PanelField>

        <PanelField label="Last update">
          {last ? (
            <span className="k-mono text-[11.5px]">{fmtDate(last)}</span>
          ) : (
            <span className="text-k-mute">Never</span>
          )}
        </PanelField>

        <PanelField label="Milestones">
          {ms.total ? (
            <span className="k-mono text-[11.5px]">
              {ms.achieved}/{ms.total}
              {ms.missed > 0 && (
                <span className="ml-1.5 text-k-text-red">
                  {ms.missed} missed
                </span>
              )}
            </span>
          ) : (
            <span className="text-k-mute">None</span>
          )}
        </PanelField>
      </dl>

      <h3 className="k-eyebrow mt-5">Recent activity</h3>
      {recent.length ? (
        <ul className="mt-2 space-y-2">
          {recent.map((e) => (
            <li
              key={e.id}
              className="border-b border-k-line-2 pb-2 last:border-b-0 last:pb-0"
            >
              <p className="k-mono text-[10.5px] text-k-mute">
                {fmtDate(e.date)}
                {e.addedBy && <> · {e.addedBy}</>}
              </p>
              <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[12px] leading-[1.5] text-k-ink-3">
                {e.update}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-k-mute">No updates yet.</p>
      )}

      {/* The route survives untouched. This panel is the fast read; the page is
          where milestones, attachments and the composer live. */}
      <Link
        href={`/integrations/${encodeURIComponent(clientId)}/${encodeURIComponent(integration.id)}`}
        className="k-btn k-btn-outline k-btn-sm mt-5 w-full justify-center"
      >
        Open full record
        <ArrowRight size={13} strokeWidth={1.5} aria-hidden />
      </Link>
    </aside>
  );
}

/** Label left, value right, hairline between — the phase panel's row. */
function PanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-k-line-2 py-2.5 last:border-b-0">
      <dt className="shrink-0 text-[11.5px] text-k-mute">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[12px] font-semibold text-k-ink">
        {children}
      </dd>
    </div>
  );
}
