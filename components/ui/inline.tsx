"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useUpdateEntity, buildPatch, isConflict, type EntityKind } from "@/lib/query/mutations";
import { ApiError } from "@/lib/api/fetcher";

/**
 * Inline editing.
 *
 * SCOPED TO WHAT WAS ACTUALLY INLINE IN v1, which is narrower than it sounds:
 * four `<select>`s that saved on change (integration status, assignee and
 * effort weight, and the Implementation client's master assignee). Everything
 * else was an explicit Save button or a modal. Widening that is a design
 * decision, not a port, so it is not made here.
 *
 * Two defects in v1's version are fixed rather than reproduced:
 *
 * IT NEVER RE-RENDERED ON SUCCESS. `statusEl.disabled = false` and nothing
 * else, so RAG badges, progress rings and counts stayed stale until something
 * unrelated redrew the page. The cache update fixes that for free.
 *
 * IT HAD NO UNSAVED-CHANGES GUARD ANYWHERE. Typing into a field and navigating
 * away discarded it silently — which is why v1's background refresh was
 * forbidden from re-rendering at all. `InlineText` commits on blur, so there is
 * nothing left dangling.
 */

interface Target {
  kind: EntityKind;
  clientId: string;
  id: string;
  /** API path for this entity's PATCH. */
  path: string;
  /** Recorded on the audit row. */
  screen?: string;
}

/** Turns a failed write into something the person can act on. */
function useSaveFeedback() {
  return (error: unknown) => {
    if (isConflict(error)) {
      toast.error("Someone else saved this first — reloading their version.");
      return;
    }
    toast.error(
      error instanceof ApiError ? error.message : "Could not save. Try again.",
    );
  };
}

/**
 * A select that saves the moment it changes.
 *
 * Disabled while in flight rather than showing a spinner: the control is 32px
 * and a spinner inside it reads as a glitch. The optimistic update means the
 * new value is already showing, so there is nothing to wait for visually.
 */
export function InlineSelect<T extends object>({
  target,
  field,
  value,
  options,
  version,
  before,
  label,
  disabled,
  emptyLabel = "—",
  unknownSuffix = "(unrecognised)",
}: {
  target: Target;
  field: keyof T & string;
  value: string;
  options: readonly string[];
  version: string | undefined;
  before: T;
  label: string;
  disabled?: boolean;
  /** What the empty option reads as. A blank row is not self-explanatory. */
  emptyLabel?: string;
  /**
   * Appended to a value that matches no option. Field-specific: "(not a
   * current user)" is right for an assignee and nonsense on a status.
   */
  unknownSuffix?: string;
}) {
  const onFailure = useSaveFeedback();
  const update = useUpdateEntity(target.kind, target.clientId, target.id, {
    path: target.path,
    screen: target.screen,
    onFailure,
  });

  // A <select> whose value is absent from its options silently displays the
  // FIRST option instead — so the row would calmly report the wrong owner. That
  // is not hypothetical here: assignee columns hold typed display names, and
  // production already contains two ("Himanshu", "Nisha") that match no user.
  // The current value is always offered, marked as unrecognised.
  const known = options.includes(value);
  const choices = known ? options : [value, ...options];

  return (
    <select
      className="k-select"
      aria-label={label}
      value={value}
      disabled={disabled || update.isPending || !version}
      // No version means the read path did not supply one. Sending the write
      // anyway would 428; disabling says so quietly instead.
      title={version ? undefined : "Reload to edit this"}
      onChange={(e) => {
        const patch = buildPatch(before, { [field]: e.target.value } as never, [
          field,
        ]);
        if (!Object.keys(patch).length || !version) return;
        update.mutate({ version, patch });
      }}
    >
      {choices.map((o) => (
        <option key={o} value={o}>
          {o === "" ? emptyLabel : o}
          {o === value && !known ? ` ${unknownSuffix}` : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * A read-mode value that becomes an input when you click it.
 *
 * Commits on blur or Enter, abandons on Escape. No debounced autosave: v1 had
 * none either, and a field that saves while you are still typing turns every
 * intermediate state into an audit row.
 */
export function InlineText<T extends object>({
  target,
  field,
  value,
  version,
  before,
  label,
  placeholder = "—",
  /** Sends `null` rather than `""` when cleared, so the column goes null. */
  nullable,
}: {
  target: Target;
  field: keyof T & string;
  value: string;
  version: string | undefined;
  before: T;
  label: string;
  placeholder?: string;
  nullable?: boolean;
}) {
  // `draft` exists only while editing, and is seeded when edit mode opens.
  //
  // The obvious alternative — `useState(value)` plus an effect re-syncing it
  // whenever `value` changes — trips React 19's set-state-in-effect rule, and
  // deservedly: it makes the field's contents a copy that can drift from its
  // source. Since the resting state renders `value` directly, there is nothing
  // to keep in sync, and a background refetch landing mid-edit cannot yank the
  // text out from under whoever is typing.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // THE ROW AS IT WAS WHEN EDITING BEGAN — value and OCC token together.
  //
  // Keeping the draft un-synced while letting `version` refresh from props was
  // a silent lost update: click into a field, let the 60-second refetch land
  // someone else's change and a NEW token, click away, and the old value went
  // up with THEIR token. The server saw a valid precondition, accepted it, and
  // their edit was reverted with no 409 and no conflict card — which defeats
  // the entire mechanism `_v` exists for. Sending the token you actually read
  // turns that back into the conflict it always was.
  const opened = useRef<{ version: string | undefined; before: T } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape must ABANDON. Closing the field can in principle fire `blur` on the
  // way out, which would commit the edit Escape just discarded — a ref, not
  // state, because `commit` has to see it in the same tick.
  //
  // Defensive: the case is not reproducible in jsdom, because closing unmounts
  // the input before a dispatched blur can reach React. Kept anyway, and the
  // test says plainly that it does not cover it rather than implying it does.
  const abandoned = useRef(false);
  const onFailure = useSaveFeedback();

  const update = useUpdateEntity(target.kind, target.clientId, target.id, {
    path: target.path,
    screen: target.screen,
    onFailure,
  });

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (abandoned.current) {
      abandoned.current = false;
      return;
    }
    const snapshot = opened.current;
    opened.current = null;
    if (!snapshot) return;

    const next = draft.trim();
    const patch = buildPatch(
      snapshot.before,
      { [field]: nullable && next === "" ? null : next } as never,
      [field],
    );
    if (!Object.keys(patch).length) return;
    if (!snapshot.version) {
      toast.error("Reload before editing this — its version is missing.");
      return;
    }
    update.mutate({ version: snapshot.version, patch });
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="k-field k-field-edit"
        onClick={() => {
          opened.current = { version, before };
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`${label}: ${value || "empty"}. Click to edit`}
      >
        <span className={value ? "text-k-ink" : "text-k-mute"}>
          {value || placeholder}
        </span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="k-input k-input-sm"
      aria-label={label}
      value={draft}
      disabled={update.isPending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          abandoned.current = true;
          setEditing(false);
        }
      }}
      autoFocus
    />
  );
}
