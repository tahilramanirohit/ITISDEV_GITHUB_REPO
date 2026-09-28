import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Plus } from "lucide-react";
import { createSession, listSessions, type NewSession, type SessionListItem } from "../../lib/api/sessions";
import {
  CONTEXT_LABELS, FORMAT_LABELS, PLAY_FORMATS, SESSION_CONTEXTS,
  type PerformanceScope, type PlayFormat, type SessionContext,
} from "../../lib/api/types";
import { deriveAnalysisState, type AnalysisUiState } from "../../lib/analysis/state";
import { BLUE_SKY, BORDER, NEON, NEON_D, WHITE_DIM, WHITE_SUB } from "../theme";
import { Card, Notice, Pill, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { AnalysisStateBadge } from "../analysis/AnalysisStatus";
import { GoalFields } from "./GoalFields";
import { JourneySteps } from "./JourneySteps";

const today = () => new Date().toISOString().slice(0, 10);

const NEXT_ACTION: Record<AnalysisUiState, string> = {
  not_uploaded: "Upload a video",
  uploading: "Continue upload",
  upload_incomplete: "Resume upload",
  queued: "Waiting for analysis",
  processing: "Analyzing video",
  completed: "View feedback",
  insufficient_data: "Review the result",
  failed: "See what went wrong",
};

export default function SessionsPage({ sb }: { sb: SupabaseClient }) {
  const [items, setItems] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listSessions(sb).then(setItems).catch((e) => setError(e.message));
  }, [sb]);
  useEffect(load, [load]);

  return (
    <div className="space-y-7">
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: NEON }}>Your pickleball progress</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white">Know what to practice next</h1>
            <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>
              Choose a skill, add a video, and get feedback on what PicklePro can observe.
            </p>
          </div>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold"
              style={{ background: NEON, color: NEON_D }}>
              <Plus size={18} /> Start a video review
            </button>
          )}
        </div>
        <JourneySteps current={1} />
      </section>

      {creating && <NewSessionForm sb={sb} onCancel={() => setCreating(false)} />}
      {error && <Notice tone="error">{error}</Notice>}

      <section aria-labelledby="sessions-heading" className="space-y-3">
        <div>
          <h2 id="sessions-heading" className="text-lg font-bold text-white">Your sessions</h2>
          <p className="text-sm" style={{ color: WHITE_DIM }}>Pick up where you left off or review an earlier result.</p>
        </div>
        {items === null ? (
          <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
        ) : items.length === 0 ? (
          <Card>
            <h3 className="text-base font-semibold text-white">No sessions yet</h3>
            <p className="text-sm mt-1" style={{ color: WHITE_DIM }}>Start with one skill you want to improve. You can add a video in the next step.</p>
          </Card>
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => {
              const state = deriveAnalysisState({ video: item.video, job: item.job, result: item.result });
              return (
                <li key={item.session.id}>
                  <a href={`#/sessions/${item.session.id}`} className="block rounded-2xl p-4 transition-all hover:brightness-110"
                    style={{ background: "rgba(13,37,84,0.9)", border: `1px solid ${BORDER}` }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-white">{item.session.title}</h3>
                        <p className="text-sm mt-1" style={{ color: WHITE_DIM }}>
                          {item.session.session_date} · {CONTEXT_LABELS[item.session.session_context]} · {FORMAT_LABELS[item.session.play_format]}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {item.result?.data_origin === "test_fixture" && <Pill color="#f43f5e">TEST DATA</Pill>}
                        <AnalysisStateBadge state={state} />
                        <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: NEON }}>
                          {NEXT_ACTION[state]} <ArrowRight size={16} aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewSessionForm({ sb, onCancel }: { sb: SupabaseClient; onCancel: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<NewSession>({
    title: "", session_date: today(), session_context: "practice", play_format: "singles",
    performance_scope: "individual", notes: null, improvement_goals: [],
    positioning_rating: null, shot_outcomes_rating: null, shot_technique_rating: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof NewSession>(k: K, v: NewSession[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the session a title.");
    if (!form.improvement_goals.length) return setError("Choose at least one skill to improve.");
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
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: BLUE_SKY }}>Step 1 of 3</p>
        <h2 className="text-xl font-bold text-white mt-1">What would you like to improve?</h2>
        <p className="text-sm mt-1" style={{ color: WHITE_DIM }}>Pick at least one focus. Your rating is optional and only reflects how you see your current level.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <GoalFields value={form} onChange={(goals) => setForm((current) => ({ ...current, ...goals }))} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} style={labelStyle} htmlFor="title">Give this session a name</label>
          <input id="title" maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Tuesday practice" className="w-full rounded-xl px-3 py-3 text-sm" style={fieldStyle} />
        </div>
        <details className="sm:col-span-2 rounded-xl p-4" style={{ border: `1px solid ${BORDER}` }}>
          <summary className="text-sm font-semibold cursor-pointer" style={{ color: BLUE_SKY }}>Session details (optional)</summary>
          <p className="text-xs mt-1" style={{ color: WHITE_DIM }}>Defaults to today's singles practice. Open to change the date, play format, or add notes.</p>
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
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
                placeholder="What would you like the coach to pay attention to?" className="w-full rounded-xl px-3 py-2 text-sm" style={fieldStyle} />
            </div>
          </div>
        </details>
        {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
            style={{ background: NEON, color: NEON_D }}>{busy ? "Creating…" : "Continue to video upload"}</button>
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm" style={{ color: WHITE_DIM, border: `1px solid ${BORDER}` }}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
