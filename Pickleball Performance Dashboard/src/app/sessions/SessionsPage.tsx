import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { createSession, listSessions, type NewSession, type SessionListItem } from "../../lib/api/sessions";
import {
  CONTEXT_LABELS, FORMAT_LABELS, PLAY_FORMATS, SESSION_CONTEXTS,
  type PerformanceScope, type PlayFormat, type SessionContext,
} from "../../lib/api/types";
import { deriveAnalysisState } from "../../lib/analysis/state";
import { BLUE_SKY, BORDER, NEON, NEON_D, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice, Pill, WidgetHeader, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { AnalysisStateBadge } from "../analysis/AnalysisStatus";

const today = () => new Date().toISOString().slice(0, 10);

export default function SessionsPage({ sb }: { sb: SupabaseClient }) {
  const [items, setItems] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listSessions(sb).then(setItems).catch((e) => setError(e.message));
  }, [sb]);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold font-mono tracking-widest uppercase" style={{ color: NEON }}>My sessions</div>
          <h1 className="text-xl font-bold text-white">Recorded practice and games</h1>
          <p className="text-xs mt-0.5" style={{ color: WHITE_DIM }}>
            Create a session, upload one fixed-camera video, and review what the analysis could and could not measure.
          </p>
        </div>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold"
            style={{ background: NEON, color: NEON_D }}>
            <Plus size={14} /> NEW SESSION
          </button>
        )}
      </div>

      {creating && <NewSessionForm sb={sb} onCancel={() => setCreating(false)} />}
      {error && <Notice tone="error">{error}</Notice>}

      {items === null ? (
        <p className="text-sm" style={{ color: WHITE_SUB }}>Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: WHITE_DIM }}>
            No sessions yet. Performance history appears here only after your own videos are analyzed — nothing is pre-filled.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.session.id}>
              <a href={`#/sessions/${item.session.id}`} className="block rounded-2xl p-4 transition-all hover:brightness-110"
                style={{ background: "rgba(13,37,84,0.9)", border: `1px solid ${BORDER}` }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{item.session.title}</div>
                    <div className="text-xs" style={{ color: WHITE_SUB }}>
                      {item.session.session_date} · {CONTEXT_LABELS[item.session.session_context]} ·{" "}
                      {FORMAT_LABELS[item.session.play_format]} · {item.session.performance_scope}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.result?.data_origin === "test_fixture" && <Pill color="#f43f5e">TEST DATA</Pill>}
                    <AnalysisStateBadge state={deriveAnalysisState({ video: item.video, job: item.job, result: item.result })} />
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewSessionForm({ sb, onCancel }: { sb: SupabaseClient; onCancel: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<NewSession>({
    title: "", session_date: today(), session_context: "practice", play_format: "singles",
    performance_scope: "individual", notes: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof NewSession>(k: K, v: NewSession[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the session a title.");
    setBusy(true);
    setError("");
    try {
      const s = await createSession(sb, { ...form, title: form.title.trim(), notes: form.notes?.trim() || null });
      navigate(`/sessions/${s.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Card accent={BLUE_SKY}>
      <WidgetHeader title="New session" subtitle="Context is required so results can later be compared within the same kind of play." accent={BLUE_SKY} />
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} style={labelStyle} htmlFor="title">Title</label>
          <input id="title" maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Tuesday dinking drill" className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="date">Date</label>
          <input id="date" type="date" value={form.session_date} onChange={(e) => set("session_date", e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="context">Context</label>
          <select id="context" value={form.session_context} onChange={(e) => set("session_context", e.target.value as SessionContext)}
            className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}>
            {SESSION_CONTEXTS.map((c) => <option key={c} value={c} className="bg-[#071a3e]">{CONTEXT_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="format">Format</label>
          <select id="format" value={form.play_format} onChange={(e) => set("play_format", e.target.value as PlayFormat)}
            className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}>
            {PLAY_FORMATS.map((f) => <option key={f} value={f} className="bg-[#071a3e]">{FORMAT_LABELS[f]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="scope">Performance scope</label>
          <select id="scope" value={form.performance_scope} onChange={(e) => set("performance_scope", e.target.value as PerformanceScope)}
            className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle}>
            <option value="individual" className="bg-[#071a3e]">Individual</option>
            <option value="pair" className="bg-[#071a3e]">Pair</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} style={labelStyle} htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" rows={2} maxLength={2000} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
            placeholder="Goal for the session, what to review…" className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle} />
        </div>
        {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
            style={{ background: NEON, color: NEON_D }}>{busy ? "Creating…" : "Create session"}</button>
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm" style={{ color: WHITE_DIM, border: `1px solid ${BORDER}` }}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
