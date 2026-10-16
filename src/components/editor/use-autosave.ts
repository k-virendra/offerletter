"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraft, type DraftPatch } from "@/app/(editor)/letters/actions";
import type { LetterState } from "@/lib/letter/types";

// Autosave for drafts (see the interaction notes on the design canvas):
//   * typing saves 800 ms after the last keystroke; leaving a field, removing or restoring a section and changing
//     the style or colour save straight away,
//   * each save sends only what changed, with the edited_at the server last returned,
//   * offline, changes stay in this browser and are sent when the connection returns,
//   * leaving the page asks first only while something is unsaved.

export type SaveStatus = "saved" | "saving" | "offline" | "error" | "conflict";

const DEBOUNCE_MS = 800;
const backupKey = (id: string) => `olp.draft.${id}`;

function diff(before: LetterState, after: LetterState): DraftPatch {
  const patch: DraftPatch = {};
  if (before.name !== after.name) patch.name = after.name;
  if (before.templateKey !== after.templateKey) patch.templateKey = after.templateKey;
  if (before.accentColor !== after.accentColor) patch.accentColor = after.accentColor;
  if (JSON.stringify(before.removedSections) !== JSON.stringify(after.removedSections)) patch.removedSections = after.removedSections;
  if (JSON.stringify(before.values) !== JSON.stringify(after.values)) patch.values = after.values;
  return patch;
}

const isEmptyPatch = (patch: DraftPatch) => Object.keys(patch).length === 0;
const urgent = (patch: DraftPatch) => "templateKey" in patch || "accentColor" in patch || "removedSections" in patch;

function readBackup(id: string): { base: string; state: LetterState } | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as { base: string; state: LetterState }) : null;
  } catch {
    return null;
  }
}
function writeBackup(id: string, value: { base: string; state: LetterState } | null) {
  try {
    if (value) localStorage.setItem(backupKey(id), JSON.stringify(value));
    else localStorage.removeItem(backupKey(id));
  } catch {
    // Storage can be unavailable (private windows); the save itself still works.
  }
}

export function useAutosave({
  letterId,
  editedAt,
  state,
  onLocked,
}: {
  letterId: string;
  editedAt: string;
  state: LetterState;
  onLocked: (message: string) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string>();
  const saved = useRef(state);
  const base = useRef(editedAt);
  const latest = useRef(state);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const onLockedRef = useRef(onLocked);

  useEffect(() => {
    latest.current = state;
    onLockedRef.current = onLocked;
  });

  const runRef = useRef<() => Promise<void>>(async () => {});
  const run = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    // One save at a time: wait for the one in flight, then send whatever is still different.
    while (running.current) await running.current;
    if (blocked.current) return;
    const sending = latest.current;
    const patch = diff(saved.current, sending);
    if (isEmptyPatch(patch)) {
      setStatus("saved");
      writeBackup(letterId, null);
      return;
    }
    setStatus("saving");
    running.current = (async () => {
      try {
        const result = await saveDraft(letterId, base.current, patch);
        if (result.ok) {
          saved.current = sending;
          base.current = result.editedAt;
          setMessage(undefined);
          if (isEmptyPatch(diff(sending, latest.current))) {
            setStatus("saved");
            writeBackup(letterId, null);
          }
          return;
        }
        writeBackup(letterId, { base: base.current, state: latest.current });
        setMessage(result.message);
        if (result.reason === "conflict" || result.reason === "gone") {
          blocked.current = true;
          setStatus("conflict");
        } else if (result.reason === "locked") {
          // Put the section back; the next save sends the corrected list.
          saved.current = { ...sending, removedSections: saved.current.removedSections };
          onLockedRef.current(result.message);
          setStatus("error");
        } else {
          setStatus("error");
        }
      } catch {
        writeBackup(letterId, { base: base.current, state: latest.current });
        setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        setMessage(undefined);
      } finally {
        running.current = null;
      }
    })();
    await running.current;
    if (!blocked.current && !isEmptyPatch(diff(saved.current, latest.current)) && navigator.onLine) {
      timer.current = setTimeout(() => void runRef.current(), DEBOUNCE_MS);
    }
  }, [letterId]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // Schedule a save whenever the state moves away from what the server has.
  useEffect(() => {
    const patch = diff(saved.current, state);
    if (isEmptyPatch(patch) || blocked.current) return;
    setStatus((current) => (current === "offline" || current === "conflict" ? current : "saving"));
    writeBackup(letterId, { base: base.current, state });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), urgent(patch) ? 0 : DEBOUNCE_MS);
  }, [state, letterId, run]);

  // Back online: send what was kept on this device.
  useEffect(() => {
    const online = () => void run();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [run]);

  // Only ask before leaving when something isn't saved.
  useEffect(() => {
    if (status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // Leaving the editor inside the app (a link): send any pending change.
  useEffect(
    () => () => {
      if (!blocked.current && !isEmptyPatch(diff(saved.current, latest.current))) void run();
    },
    [run],
  );

  return {
    status,
    message,
    /** Save now and wait for it, e.g. before checkout. Resolves true when everything is saved. */
    flush: useCallback(async () => {
      await run();
      return !blocked.current && isEmptyPatch(diff(saved.current, latest.current));
    }, [run]),
    retry: useCallback(() => void run(), [run]),
    /** The edited_at of the last version the server confirmed. */
    editedAt: useCallback(() => base.current, []),
  };
}

/** A copy kept on this device after a failed save, if it was made on top of the version the server has now. */
export function recoverBackup(letterId: string, editedAt: string): LetterState | null {
  const backup = readBackup(letterId);
  if (!backup) return null;
  if (backup.base !== editedAt) {
    writeBackup(letterId, null);
    return null;
  }
  return backup.state;
}
