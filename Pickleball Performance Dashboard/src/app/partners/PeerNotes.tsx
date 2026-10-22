import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Clock, MessageSquareText, Pencil, Trash2 } from "lucide-react";
import {
  MAX_NOTE, addNote, deleteNote, editNote, formatVideoTime, listNotes, partnerErrorText, type PeerNote,
} from "../../lib/api/partners";
import type { VideoControls } from "../analysis/ResultView";
import { BORDER, GREEN, GREEN_BG, INK, WHITE_DIM } from "../theme";
import { Card, Notice, PrimaryButton, WidgetHeader, fieldStyle } from "../shell/primitives";

/** The video's current time, kept up to date while it plays or is moved. */
function useVideoTime(video: HTMLVideoElement | null): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!video) return;
    const update = () => setNow(video.currentTime);
    update();
    video.addEventListener("timeupdate", update);
    video.addEventListener("seeked", update);
    return () => {
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("seeked", update);
    };
  }, [video]);
  return now;
}

function NoteText({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <div className="grid gap-1">
    <label className="grid gap-1 text-sm font-bold" style={{ color: INK }}>{label}
      <textarea rows={3} value={value} maxLength={MAX_NOTE} onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. You stayed at the baseline after your return. Move up to the kitchen line."
        className="w-full min-w-0 resize-y px-3 py-2 text-base font-normal" style={fieldStyle} />
    </label>
    <span className="text-xs" style={{ color: WHITE_DIM }}>{value.length}/{MAX_NOTE} characters</span>
  </div>;
}

/**
 * Notes pinned to moments in a session's video (requirement M03). A partner the
 * session is shared with writes and edits their own notes; the owner reads every
 * note and can delete any of them.
 */
export function PeerNotes({ sb, sessionId, mode, ownerName, controls }: {
  sb: SupabaseClient; sessionId: string; mode: "owner" | "partner"; ownerName?: string; controls: VideoControls;
}) {
  const [notes, setNotes] = useState<PeerNote[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = useVideoTime(controls.video);
  const canPin = !!controls.video;

  const load = useCallback(async () => {
    try {
      setNotes(await listNotes(sb, sessionId));
    } catch (e) {
      // The owner's report still works before the partners update; the partner page shows the problem.
      if (mode === "owner") setNotes([]); else setError(partnerErrorText(e));
    }
  }, [sb, sessionId, mode]);
  useEffect(() => { void load(); }, [load]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(partnerErrorText(e));
    } finally {
      setBusyId(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return setError("Write a note first.");
    setSaving(true);
    setError("");
    try {
      await addNote(sb, sessionId, canPin && pin ? now : null, draft);
      setDraft("");
      await load();
    } catch (err) {
      setError(partnerErrorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (notes === null) return null;
  if (mode === "owner" && notes.length === 0) return null;

  return (
    <Card>
      <WidgetHeader title={mode === "owner" ? `Partner notes (${notes.length})` : "Your notes"}
        subtitle={mode === "owner" ? "Notes your partners left on this video. Tap a time to watch that moment."
          : `Pause the video at a moment and write what you noticed. ${ownerName ?? "The player"} sees your notes in their report.`} />
      {mode === "partner" && <form onSubmit={submit} className="mb-4 space-y-3" aria-label="Add a note">
        <NoteText label="Note" value={draft} onChange={setDraft} />
        {canPin && <label className="flex items-center gap-2 text-sm" style={{ color: INK }}>
          <input type="checkbox" className="h-5 w-5" checked={pin} onChange={(e) => setPin(e.target.checked)} />
          Pin to the video at {formatVideoTime(now)}
        </label>}
        <PrimaryButton type="submit" disabled={saving}>
          <MessageSquareText size={18} aria-hidden="true" />
          {saving ? "Saving…" : canPin && pin ? `Add note at ${formatVideoTime(now)}` : "Add note"}</PrimaryButton>
      </form>}
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      {notes.length === 0 ? <p className="text-sm" style={{ color: WHITE_DIM }}>No notes yet.</p>
        : <ul className="space-y-2" aria-label="Notes">{notes.map((n) => <li key={n.id} className="rounded-[var(--radius-md)] p-3"
            style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex flex-wrap items-center gap-2">
              {n.video_time_s != null
                ? <button type="button" onClick={() => controls.seek(n.video_time_s ?? 0)} disabled={!controls.video}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-sm font-bold disabled:opacity-60"
                    style={{ background: GREEN_BG, color: GREEN }} aria-label={`Watch at ${formatVideoTime(n.video_time_s)}`}>
                    <Clock size={14} aria-hidden="true" />{formatVideoTime(n.video_time_s)}</button>
                : <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: GREEN_BG, color: INK }}>Whole session</span>}
              <span className="text-sm font-bold" style={{ color: INK }}>{n.mine ? "You" : n.author_name}</span>
              <span className="text-xs" style={{ color: WHITE_DIM }}>
                {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {n.updated_at !== n.created_at ? " · edited" : ""}</span>
            </div>
            {editing?.id === n.id
              ? <div className="mt-2 space-y-2">
                  <NoteText label="Edit note" value={editing.body} onChange={(body) => setEditing({ id: n.id, body })} />
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton disabled={busyId === n.id} onClick={() => void run(n.id, async () => {
                      await editNote(sb, n.id, editing.body);
                      setEditing(null);
                    })}>Save</PrimaryButton>
                    <PrimaryButton tone="light" onClick={() => setEditing(null)}>Cancel</PrimaryButton>
                  </div>
                </div>
              : <p className="mt-2 whitespace-pre-line text-base" style={{ color: INK }}>{n.body}</p>}
            {editing?.id !== n.id && <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold">
              {n.mine && mode === "partner" && <button type="button" className="inline-flex min-h-[36px] items-center gap-1" style={{ color: GREEN }}
                onClick={() => { setEditing({ id: n.id, body: n.body }); setConfirmDelete(null); }}>
                <Pencil size={14} aria-hidden="true" /> Edit</button>}
              {(n.mine || mode === "owner") && (confirmDelete === n.id
                ? <span className="inline-flex flex-wrap items-center gap-3">
                    <span style={{ color: INK }}>Delete this note?</span>
                    <button type="button" className="min-h-[36px] underline" style={{ color: "var(--danger)" }} disabled={busyId === n.id}
                      onClick={() => void run(n.id, () => deleteNote(sb, n.id))}>Delete</button>
                    <button type="button" className="min-h-[36px]" style={{ color: WHITE_DIM }} onClick={() => setConfirmDelete(null)}>Keep</button>
                  </span>
                : <button type="button" className="inline-flex min-h-[36px] items-center gap-1" style={{ color: WHITE_DIM }}
                    onClick={() => setConfirmDelete(n.id)}><Trash2 size={14} aria-hidden="true" /> Delete</button>)}
            </div>}
          </li>)}</ul>}
    </Card>
  );
}
