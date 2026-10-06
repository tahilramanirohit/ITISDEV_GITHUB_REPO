import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, LogOut, Settings } from "lucide-react";
import { getProfile, saveProfile, type ProfileInput } from "../../lib/api/profile";
import { useSessionsData, weekStreak } from "../sessions/sessionUi";
import { playerCode } from "../../lib/api/players";
import { Card, Chip, Notice, PrimaryButton, SectionTitle, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { BLUE, BORDER, HERO, INK, OPTIC, ROSE, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";

const empty: ProfileInput = {
  display_name: "", dominant_hand: null, years_playing: null, usual_format: null,
  self_level: null, is_adult_confirmed: false,
};

const HANDS = [["right", "Right"], ["left", "Left"], ["ambidextrous", "Both"]] as const;
const FORMATS = [["singles", "Singles"], ["doubles", "Doubles"], ["both", "Both"]] as const;

export default function ProfilePage({ sb, userId, account, signOut }: {
  sb: SupabaseClient; userId: string; account?: string;
  signOut?: { label: string; onClick: () => void; warning?: string };
}) {
  const { items, assessments } = useSessionsData(sb);
  const [form, setForm] = useState<ProfileInput>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getProfile(sb, userId)
      .then((profile) => { if (active && profile) setForm({
        display_name: profile.display_name ?? "", dominant_hand: profile.dominant_hand ?? null,
        years_playing: profile.years_playing ?? null, usual_format: profile.usual_format ?? null,
        self_level: profile.self_level ?? null, is_adult_confirmed: !!profile.is_adult_confirmed,
      }); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sb, userId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setSaved(false); setSaving(true);
    try {
      await saveProfile(sb, userId, {
        ...form,
        display_name: form.display_name.trim(),
        self_level: form.self_level?.trim() || null,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  const letter = (form.display_name || account || "P").trim().slice(0, 1).toUpperCase();
  const sessions = items ?? [];
  const rated = sessions.filter((i) => assessments.some((x) => x.session_id === i.session.id)).length;
  const streak = weekStreak(sessions.map((i) => i.session.session_date));
  if (loading) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading profile…</p>;
  return <div className="space-y-6">
    {/* Profile header in the style of a sports app: banner, avatar, name, ID and a stats row. */}
    <section className="overflow-hidden rounded-2xl" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-label="Your profile">
      <div className="h-20 md:h-24" style={{ background: `linear-gradient(120deg, ${HERO}, ${BLUE})` }} />
      <div className="px-4 pb-4">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <span className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-extrabold" style={{ background: OPTIC, color: INK, border: `4px solid ${WHITE}` }}>{letter}</span>
          <a href="#/settings" className="mb-1 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm font-bold" style={{ border: `1px solid ${BORDER}`, color: INK }}>
            <Settings size={16} aria-hidden="true" /> Settings
          </a>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight" style={{ color: INK }}>{form.display_name || "Player"}</h1>
        <p className="text-sm" style={{ color: WHITE_DIM }}>{[form.self_level, form.usual_format && `${form.usual_format[0].toUpperCase()}${form.usual_format.slice(1)}`].filter(Boolean).join(" · ") || account}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "#eceef2", color: INK }} title="Your player ID">
          Player ID <span className="font-mono">{playerCode(userId)}</span>
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3" style={{ borderColor: BORDER }}>
          {[["Sessions", sessions.length], ["Rated", rated], ["Week streak", streak]].map(([label, value]) => (
            <div key={label as string}><p className="text-[11px]" style={{ color: WHITE_SUB }}>{label}</p><p className="text-xl font-extrabold" style={{ color: INK }}>{value}</p></div>
          ))}
        </div>
      </div>
    </section>

    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
    <Card>
      <SectionTitle>Player details</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Private to your account. Context for your plans, not a skill rating.</p>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      {saved && <div className="mt-4"><Notice tone="info">Profile saved.</Notice></div>}
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-4">
        <label className="grid gap-1 text-sm font-semibold">Display name
          <input required maxLength={80} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
        </label>
        <div>
          <p className={labelClass} style={labelStyle}>Dominant hand</p>
          <div className="flex flex-wrap gap-2">{HANDS.map(([v, l]) => <Chip key={v} selected={form.dominant_hand === v}
            onClick={() => setForm({ ...form, dominant_hand: form.dominant_hand === v ? null : v })}>{l}</Chip>)}</div>
        </div>
        <div>
          <p className={labelClass} style={labelStyle}>Usual format</p>
          <div className="flex flex-wrap gap-2">{FORMATS.map(([v, l]) => <Chip key={v} selected={form.usual_format === v}
            onClick={() => setForm({ ...form, usual_format: form.usual_format === v ? null : v })}>{l}</Chip>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Years playing
            <input type="number" inputMode="decimal" min="0" max="99" step="0.1" value={form.years_playing ?? ""}
              onChange={(e) => setForm({ ...form, years_playing: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-full min-w-0 rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Level (your words)
            <input maxLength={40} value={form.self_level ?? ""} onChange={(e) => setForm({ ...form, self_level: e.target.value || null })}
              placeholder="e.g. 3.0" className="w-full min-w-0 rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={form.is_adult_confirmed} onChange={(e) => setForm({ ...form, is_adult_confirmed: e.target.checked })} />
          <span>I confirm I am at least 18 years old. This does not make my profile visible to others.</span>
        </label>
        <PrimaryButton type="submit" disabled={saving || !form.display_name.trim()}>{saving ? "Saving…" : "Save profile"}</PrimaryButton>
      </form>
    </Card>

    <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-label="Profile links">
      {[["#/settings", "Settings", "Default settings, display, research tools"], ["#/welcome", "My game and starting skills", "Level, goals and usual skill ratings"],
        ["#/progress", "Self-rated progress", "How your ratings change over time"], ["#/privacy", "Your data and privacy", "What is stored and how to delete it"]].map(([href, title, detail]) => (
        <a key={href} href={href} className="flex min-h-[56px] items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: BORDER }}>
          <span className="min-w-0"><span className="block text-sm font-semibold" style={{ color: INK }}>{title}</span><span className="block text-xs" style={{ color: WHITE_SUB }}>{detail}</span></span>
          <ChevronRight size={18} style={{ color: WHITE_SUB }} aria-hidden="true" />
        </a>
      ))}
    </section>

    {signOut && <div>
      <button type="button" onClick={signOut.onClick} title={signOut.warning}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ border: `1px solid ${ROSE}40`, color: ROSE }}>
        <LogOut size={16} /> {signOut.label}
      </button>
      {signOut.warning && <p className="mt-2 text-center text-xs" style={{ color: WHITE_SUB }}>{signOut.warning}</p>}
    </div>}
    </div>
    </div>
  </div>;
}
