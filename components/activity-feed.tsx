"use client";

import { useState } from "react";
import { Paperclip, Pencil, History, Trash2 } from "lucide-react";
import { AVATAR_PALETTE } from "@/lib/domain/constants";
import { fmtDate, fmtDateTime } from "@/lib/utils/dates";
import { EmptyState } from "@/components/ui/states";
import { ActivityComposer, useActivityItemMutations } from "@/components/activity-composer";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useCanEdit, useSession, type SessionUser } from "@/lib/query/permissions";
import type { ActivityEntry } from "@/lib/domain/types";

/**
 * The activity feed — ONE component, three variants.
 *
 * The old app rendered this three separate times (integration timeline, phase
 * updates, and the dashboard's recent-activity list) from three copies of
 * nearly the same markup, which is why only one of them ever showed the
 * "edited" marker and only one showed attachments.
 *
 * ENTRIES ARRIVE NEWEST-FIRST and are rendered in that order. v1 built the
 * array with `unshift`, so index 0 is the most recent post — the API preserves
 * that ordering rather than reversing it, and sorting here by date would
 * disagree with it whenever two entries share a day.
 */
export function ActivityFeed({
  entries,
  variant = "full",
  limit,
  emptyHint,
  /** Supply all three to make the feed writable. Omit for a read-only view. */
  parentKind,
  parentId,
  clientId,
}: {
  entries: ActivityEntry[];
  /** `full` for a detail pane, `compact` for a side panel, `inline` for tiles. */
  variant?: "full" | "compact" | "inline";
  limit?: number;
  emptyHint?: string;
  parentKind?: "integration" | "phase";
  parentId?: string;
  clientId?: string;
}) {
  const shown = limit ? entries.slice(0, limit) : entries;
  const canEdit = useCanEdit();
  const session = useSession();
  const writable = Boolean(canEdit && parentKind && parentId && clientId);

  const composer = writable ? (
    <div className={shown.length ? "mb-4" : ""}>
      <ActivityComposer
        parentKind={parentKind!}
        parentId={parentId!}
        clientId={clientId!}
      />
    </div>
  ) : null;

  if (shown.length === 0) {
    return (
      <>
        {composer}
        <EmptyState
          title="No updates yet"
          hint={emptyHint ?? "Progress notes will appear here."}
          icon={History}
        />
      </>
    );
  }

  const compact = variant !== "full";

  return (
    <>
      {composer}
      <ol className={compact ? "space-y-2.5" : "space-y-3.5"}>
        {shown.map((e) => (
          <li key={e.id} className="flex gap-2.5">
            <Avatar name={e.addedBy} size={compact ? 22 : 26} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`font-semibold text-k-ink ${compact ? "text-[12px]" : "text-[12.5px]"}`}
                >
                  {e.addedBy || "Unknown"}
                </span>
                <span
                  className="k-mono text-[10.5px] text-k-mute"
                  title={e.addedAt ? fmtDateTime(e.addedAt) : undefined}
                >
                  {fmtDate(e.date)}
                </span>
                {e.editedAt && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10.5px] text-k-mute"
                    title={`Edited ${fmtDateTime(e.editedAt)}`}
                  >
                    <Pencil size={9} strokeWidth={1.5} aria-hidden />
                    edited
                  </span>
                )}
              </div>

              {/* `whitespace-pre-wrap` because updates are plain text typed by
                  people, and their line breaks are meaningful. Never dangerously
                  set as HTML: this is the one field in the app that carries
                  arbitrary user input into a shared view. */}
              <p
                className={`mt-0.5 whitespace-pre-wrap break-words text-k-ink ${
                  compact ? "text-[12px]" : "text-[12.5px]"
                }`}
              >
                {e.update}
              </p>

              {e.attachment && <AttachmentLink attachment={e.attachment} />}

              {e.reactions && e.reactions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {countReactions(e.reactions).map(([r, n]) => (
                    <span key={r} className="k-tag text-[10.5px]">
                      {r} {n > 1 && <span className="k-mono">{n}</span>}
                    </span>
                  ))}
                </div>
              )}

              {e.history && e.history.length > 0 && (
                <p className="mt-1 text-[10.5px] text-k-mute">
                  {e.history.length} earlier version
                  {e.history.length === 1 ? "" : "s"}
                </p>
              )}

              {writable && mayModify(e, session) && (
                <EntryControls
                  parentKind={parentKind!}
                  parentId={parentId!}
                  entry={e}
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      {limit && entries.length > limit && (
        <p className="mt-2.5 text-[11px] text-k-mute">
          Showing {limit} of {entries.length}
        </p>
      )}
    </>
  );
}

/**
 * An attachment.
 *
 * The href is the SIGNED url the read path attached, never `storagePath` — a
 * path is not reachable and the bucket is private. When signing failed the
 * link is deliberately absent rather than broken: a link that 400s teaches
 * people the file is gone, when it is only temporarily unreachable.
 */
function AttachmentLink({
  attachment,
}: {
  attachment: NonNullable<ActivityEntry["attachment"]>;
}) {
  const label = (
    <>
      <Paperclip size={11} strokeWidth={1.5} aria-hidden className="shrink-0" />
      <span className="truncate">{attachment.fileName}</span>
      {attachment.sizeBytes ? (
        <span className="k-mono shrink-0 text-[10px] text-k-mute">
          {fmtBytes(attachment.sizeBytes)}
        </span>
      ) : null}
    </>
  );

  if (!attachment.url) {
    return (
      <span
        className="mt-1 inline-flex max-w-full items-center gap-1 text-[11px] text-k-mute"
        title="This file could not be prepared for download just now"
      >
        {label}
      </span>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex max-w-full items-center gap-1 text-[11px] text-k-primary hover:underline"
    >
      {label}
    </a>
  );
}

/**
 * Initials on a coloured disc.
 *
 * The colour is derived from the name, so the same person is the same colour
 * on every screen without anything being stored. No emoji anywhere in this app
 * — the handoff forbids it — so initials it is.
 */
export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const initials =
    (name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const bg = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

function countReactions(reactions: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of reactions) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m.entries()];
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}


/**
 * Author-or-admin, mirroring the server exactly.
 *
 * `assertMayModify` matches the STORED DISPLAY NAME against either `name` or
 * `username` — it is a string comparison, not an id, because that is what the
 * data holds. Offering controls the server would refuse is worse than not
 * offering them.
 */
function mayModify(entry: ActivityEntry, user: SessionUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const author = entry.addedBy ?? "";
  return author === user.name || author === user.username;
}

function EntryControls({
  parentKind,
  parentId,
  entry,
}: {
  parentKind: "integration" | "phase";
  parentId: string;
  entry: ActivityEntry;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { edit, remove } = useActivityItemMutations({
    parentKind,
    parentId,
    entryId: entry.id,
  });

  if (editing) {
    return (
      <div className="mt-2">
        <textarea
          className="k-textarea"
          rows={3}
          aria-label="Edit update"
          value={draft}
          disabled={edit.isPending}
          onChange={(ev) => setDraft(ev.target.value)}
          autoFocus
        />
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            className="k-btn k-btn-primary k-btn-sm"
            disabled={edit.isPending || !draft.trim()}
            onClick={() =>
              edit.mutate(draft.trim(), { onSuccess: () => setEditing(false) })
            }
          >
            {edit.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="k-btn k-btn-ghost k-btn-sm"
            disabled={edit.isPending}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className="k-btn k-btn-link"
          onClick={() => {
            setDraft(entry.update);
            setEditing(true);
          }}
        >
          <Pencil size={10} strokeWidth={1.5} aria-hidden />
          Edit
        </button>
        <button
          type="button"
          className="k-btn k-btn-link !text-k-text-red"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={10} strokeWidth={1.5} aria-hidden />
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this update?"
        body="Updates cannot be restored. Its edit history goes with it."
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, { onSuccess: () => setConfirming(false) })
        }
      />
    </>
  );
}
