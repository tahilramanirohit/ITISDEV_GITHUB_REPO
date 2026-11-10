import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Clock, MessageSquareText, Pencil, Trash2 } from "lucide-react";
import {
  MAX_NOTE, addNote, deleteNote, editNote, formatVideoTime, listNotes, listSessionShares, partnerErrorText, type PeerNote,
} from "../../lib/api/partners";
import type { VideoControls } from "../analysis/ResultView";
import { BORDER, GREEN, GREEN_BG, INK, ROSE, SURFACE_2, WHITE_DIM } from "../theme";
import { Card, Chip, Notice, PrimaryButton, WidgetHeader, fieldStyle } from "../shell/primitives";
import { SKILL_INFO, type SelfSkill } from "../../lib/coaching/selfAssessment";

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

function NoteText({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return <div className="grid gap-1">
    <label className="grid gap-1 text-sm font-bold" style={{ color: INK }}>{label}
      <textarea rows={3} value={value} maxLength={MAX_NOTE} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "e.g. You stayed at the baseline after your return. Move up to the kitchen line."}
        className="w-full min-w-0 resize-y px-3 py-2 text-base font-normal" style={fieldStyle} />
    </label>
    <span className="text-xs" style={{ color: WHITE_DIM }}>{value.length}/{MAX_NOTE} characters</span>
  </div>;
}

/**
 * Comments pinned to seconds of a session's video (requirement M03). Since update 14 everyone
 * on a shared session comments: the owner and each partner it is shared with, and all of
 * them see every comment. Each author edits their own; the owner can delete any.
 */
export function PeerNotes({ sb, sessionId, mode, ownerName, controls, skills = [] }: {
  sb: SupabaseClient; sessionId: string; mode: "owner" | "partner"; ownerName?: string; controls: VideoControls;
  /** Skills the owner asked about: a partner can tag a note with one. */
  skills?: SelfSkill[];
}) {
  const [tag, setTag] = useState<SelfSkill | null>(null);
  const [notes, setNotes] = useState<PeerNote[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The owner sees the comments once the session is shared with someone (or has comments).
  const [shared, setShared] = useState(mode === "partner");
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
  useEffect(() => {
    if (mode !== "owner") return;
    let active = true;
    listSessionShares(sb, sessionId).then((s) => { if (active) setShared(s.length > 0); }).catch(() => {});
    return () => { active = false; };
  }, [sb, sessionId, mode]);
  /** The owner commenting before update 14 gets the old "not shared with you" refusal. */
  const errorText = (e: unknown) => mode === "owner" && /not shared with you/i.test(e instanceof Error ? e.message : String(e))
    ? "Commenting on your own video needs a database update. Run supabase/scripts/pickleproapp_upgrade_14.sql in the Supabase SQL Editor."
    : partnerErrorText(e);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return setError("Write a comment first.");
    setSaving(true);
    setError("");
    try {
      await addNote(sb, sessionId, canPin && pin ? now : null, draft, mode === "partner" ? tag : null);
      setDraft("");
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (notes === null) return null;
  if (mode === "owner" && !shared && notes.length === 0) {
    return <Card><p className="text-sm" style={{ color: WHITE_DIM }}>No comments yet. Share this video with a partner
      (Rate &amp; plan → Ask for feedback) and you can both comment on any second of it.</p></Card>;
  }

  return (
    <Card>
      <WidgetHeader title={notes.length ? `Comments (${notes.length})` : "Comments"}
        subtitle={mode === "owner" ? "Pause the video and comment on that second. You and the partners you shared it with see every comment."
          : `Pause the video and comment on that second. ${ownerName ?? "The player"} and their partners on this video see every comment.`} />
      <form onSubmit={submit} className="mb-4 space-y-3" aria-label="Add a comment">
        <NoteText label="Comment" value={draft} onChange={setDraft}
          placeholder={mode === "owner" ? "e.g. What should I have done here?" : undefined} />
        {mode === "partner" && skills.length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="About which skill">
          {skills.map((s) => <Chip key={s} selected={tag === s} onClick={() => setTag(tag === s ? null : s)}>{SKILL_INFO[s].label}</Chip>)}
        </div>}
        {canPin && <label className="flex items-center gap-2 text-sm" style={{ color: INK }}>
          <input type="checkbox" className="h-5 w-5" checked={pin} onChange={(e) => setPin(e.target.checked)} />
          Pin to the video at {formatVideoTime(now)}
        </label>}
        <PrimaryButton type="submit" disabled={saving}>
          <MessageSquareText size={18} aria-hidden="true" />
          {saving ? "Saving…" : canPin && pin ? `Comment at ${formatVideoTime(now)}` : "Add comment"}</PrimaryButton>
      </form>
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      {notes.length === 0 ? <p className="text-sm" style={{ color: WHITE_DIM }}>No comments yet.</p>
        : <ul className="space-y-2" aria-label="Comments">{notes.map((n) => <li key={n.id} className="rounded-[var(--radius-md)] p-3"
            style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex flex-wrap items-center gap-2">
              {n.video_time_s != null
                ? <button type="button" onClick={() => controls.seek(n.video_time_s ?? 0)} disabled={!controls.video}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-sm font-bold disabled:opacity-60"
                    style={{ background: GREEN_BG, color: GREEN }} aria-label={`Watch at ${formatVideoTime(n.video_time_s)}`}>
                    <Clock size={14} aria-hidden="true" />{formatVideoTime(n.video_time_s)}</button>
                : <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: GREEN_BG, color: INK }}>Whole session</span>}
              <span className="text-sm font-bold" style={{ color: INK }}>{n.mine ? "You" : n.author_name}</span>
              {n.skill && <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: SURFACE_2, color: INK }}>{SKILL_INFO[n.skill].label}</span>}
              <span className="text-xs" style={{ color: WHITE_DIM }}>
                {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {n.updated_at !== n.created_at ? " · edited" : ""}</span>
            </div>
            {editing?.id === n.id
              ? <div className="mt-2 space-y-2">
                  <NoteText label="Edit comment" value={editing.body} onChange={(body) => setEditing({ id: n.id, body })} />
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton disabled={busyId === n.id} onClick={() => void run(n.id, async () => {
                      await editNote(sb, n.id, editing.body, n.skill ?? null);
                      setEditing(null);
                    })}>Save</PrimaryButton>
                    <PrimaryButton tone="light" onClick={() => setEditing(null)}>Cancel</PrimaryButton>
                  </div>
                </div>
              : <p className="mt-2 whitespace-pre-line text-base" style={{ color: INK }}>{n.body}</p>}
            {editing?.id !== n.id && <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold">
              {n.mine && <button type="button" className="inline-flex min-h-[36px] items-center gap-1" style={{ color: GREEN }}
                onClick={() => { setEditing({ id: n.id, body: n.body }); setConfirmDelete(null); }}>
                <Pencil size={14} aria-hidden="true" /> Edit</button>}
              {(n.mine || mode === "owner") && (confirmDelete === n.id
                ? <span className="inline-flex flex-wrap items-center gap-3">
                    <span style={{ color: INK }}>Delete this comment?</span>
                    <button type="button" className="min-h-[36px] underline" style={{ color: ROSE }} disabled={busyId === n.id}
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
