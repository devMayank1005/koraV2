"use client";

import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { useClient } from "@/lib/query/hooks";
import { QueryState, EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/status";
import { ActivityFeed } from "@/components/activity-feed";
import { fmtDate } from "@/lib/utils/dates";
import {
  isOverdue,
  daysOverdue,
  integRiskReason,
  milestoneUrgency,
} from "@/lib/domain/integrations";
import type { Milestone } from "@/lib/domain/types";

/**
 * One integration (artboard 1e): `1fr 300px`, record and activity on the left,
 * milestones and detail on the right.
 *
 * Reads from the CLIENT tree rather than fetching the integration on its own.
 * There is no `GET /api/integrations/[id]` and there should not be: the tree is
 * already cached by the rail and every other screen, so this renders instantly
 * from cache when you arrive by clicking, and costs one request when you arrive
 * by deep link.
 */
export function IntegrationDetailView({
  clientId,
  integId,
}: {
  clientId: string;
  integId: string;
}) {
  const query = useClient(clientId);
  const client = query.data;
  const integration = client?.integrations?.find((i) => i.id === integId);

  return (
    <div className="p-7">
      <QueryState
        isPending={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        skeletonRows={7}
      >
        {!integration ? (
          // A deep link to something archived or renamed. Says so, and offers
          // the way back, rather than rendering an empty shell.
          <EmptyState
            title="That integration is no longer here"
            hint="It may have been archived. Everything else for this client is still available."
          />
        ) : (
          <>
            <Link
              href={`/integrations/${clientId}`}
              className="mb-3 inline-flex items-center gap-1 text-[12px] text-k-mute hover:text-k-primary"
            >
              <ChevronLeft size={13} strokeWidth={1.5} aria-hidden />
              {client?.name ?? "Back"}
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="k-page-title min-w-0">{integration.name}</h1>
              <StatusPill status={integration.status} />
            </header>

            {integRiskReason(integration) && (
              <p className="mt-2 text-[12px] font-semibold text-k-text-red">
                {integRiskReason(integration)}
              </p>
            )}

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
              {/* -------------------------------------------------- left */}
              <div className="min-w-0 space-y-5">
                {(integration.description || integration.nextAction) && (
                  <section className="k-card p-4">
                    {integration.description && (
                      <>
                        <h2 className="k-eyebrow">Description</h2>
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-k-ink-3">
                          {integration.description}
                        </p>
                      </>
                    )}
                    {integration.nextAction && (
                      <>
                        <h2 className="k-eyebrow mt-3">Next action</h2>
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-k-ink-3">
                          {integration.nextAction}
                        </p>
                      </>
                    )}
                  </section>
                )}

                <section className="k-card p-4">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Activity</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {integration.timeline?.length ?? 0}
                    </span>
                  </div>
                  <div className="mt-3">
                    <ActivityFeed
                      entries={integration.timeline ?? []}
                      parentKind="integration"
                      parentId={integration.id}
                      clientId={clientId}
                    />
                  </div>
                </section>
              </div>

              {/* ------------------------------------------------- right */}
              <div className="space-y-5">
                <section className="k-card p-4">
                  <h2 className="k-card-title">Record</h2>
                  <dl className="mt-3 space-y-2.5">
                    <Field label="Assignee" value={integration.assignee} />
                    <Field
                      label="Due date"
                      value={
                        integration.dueDate ? (
                          <span
                            className={
                              isOverdue(integration)
                                ? "font-semibold text-k-text-red"
                                : undefined
                            }
                          >
                            {fmtDate(integration.dueDate)}
                            {isOverdue(integration) && (
                              <> · {daysOverdue(integration)}d late</>
                            )}
                          </span>
                        ) : undefined
                      }
                    />
                    <Field
                      label="Effort weight"
                      value={integration.effortWeight?.toString()}
                    />
                    <Field
                      label="Created"
                      value={
                        integration.createdAt
                          ? fmtDate(integration.createdAt)
                          : undefined
                      }
                    />
                  </dl>
                </section>

                <section className="k-card p-4">
                  <div className="k-card-head">
                    <h2 className="k-card-title">Milestones</h2>
                    <span className="k-mono text-[11px] text-k-mute">
                      {integration.milestones?.length ?? 0}
                    </span>
                  </div>
                  <div className="mt-3">
                    {!integration.milestones?.length ? (
                      <EmptyState title="No milestones" icon={Target} />
                    ) : (
                      <ul className="space-y-2.5">
                        {integration.milestones.map((m) => (
                          <MilestoneRow key={m.id} milestone={m} />
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="k-eyebrow">{label}</dt>
      <dd className="mt-0.5 text-[12.5px] text-k-ink-3">
        {value || <span className="text-k-mute">—</span>}
      </dd>
    </div>
  );
}

/**
 * A milestone row.
 *
 * `milestoneUrgency` is the domain function the old app used to decide whether
 * a pending milestone was worth flagging; reusing it means this row and the
 * dashboard's deadline tile agree about what "due soon" means.
 *
 * It returns "rose" | "orange" | "amber" — v1's own Tailwind palette names,
 * preserved by the port because the golden tests diff against the original
 * function's output. They are NOT Kognoz tokens and mean nothing in this
 * design, so they are mapped here rather than used as class names: rose is
 * past due, orange is due within three days, amber is everything else.
 */
const URGENCY_TONE = {
  rose: "text-k-text-red",
  orange: "text-k-text-amber",
  amber: "text-k-mute",
} as const;

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const tone =
    milestone.status === "Achieved"
      ? "text-k-text-green"
      : milestone.status === "Missed"
        ? "text-k-text-red"
        : URGENCY_TONE[milestoneUrgency(milestone)];

  return (
    <li className="border-l-2 border-k-line pl-2.5">
      <p className="text-[12.5px] font-semibold text-k-ink">{milestone.name}</p>
      <p className={`k-mono mt-0.5 text-[11px] ${tone}`}>
        {milestone.status}
        {milestone.dueDate && <> · {fmtDate(milestone.dueDate)}</>}
      </p>
      {milestone.owner && (
        <p className="mt-0.5 text-[11px] text-k-mute">{milestone.owner}</p>
      )}
      {milestone.notes && (
        <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-k-ink-3">
          {milestone.notes}
        </p>
      )}
    </li>
  );
}
