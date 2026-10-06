import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { getProfile, saveProfile, saveSessionDefaults, type ProfileInput, type SessionDefaults } from "../../lib/api/profile";
import { playerCode } from "../../lib/api/players";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { FORMAT_LABELS, KIND_LABELS, SOLO_FORMATS, type PlayFormat, type SessionKind } from "../../lib/api/types";
import { Card, Chip, Notice, PrimaryButton, ScreenTitle, SectionTitle, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { LargeTextToggle } from "../shell/AppShell";
import { DISPLAY_FONT, INK, OPTIC, ROSE, WHITE_DIM, WHITE_SUB } from "../theme";

const empty: ProfileInput = {
  display_name: "", dominant_hand: null, years_playing: null, usual_format: null,
  self_level: null, is_adult_confirmed: false,
};

const HANDS = [["right", "Right"], ["left", "Left"], ["ambidextrous", "Both"]] as const;
const FORMATS = [["singles", "Singles"], ["doubles", "Doubles"], ["both", "Both"]] as const;

export default function ProfilePage({ sb, userId, account, signOut, devLinks }: {
  sb: SupabaseClient; userId: string; account?: string;
  signOut?: { label: string; onClick: () => void; warning?: string }; devLinks?: ReactNode;
}) {
  const [form, setForm] = useState<ProfileInput>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [defaults, setDefaults] = useState<SessionDefaults>({ default_review_mode: null, default_session_kind: null, default_play_format: null });
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");

  async function submitDefaults() {
    setSavingDefaults(true); setDefaultsMessage("");
    try {
      await saveSessionDefaults(sb, userId, defaults);
      setDefaultsMessage("Saved. New sessions start with these settings.");
    } catch (e) {
      setDefaultsMessage(friendlyDbError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally { setSavingDefaults(false); }
  }

  useEffect(() => {
    let active = true;
    getProfile(sb, userId)
      .then((profile) => { if (active && profile) setForm({
        display_name: profile.display_name ?? "", dominant_hand: profile.dominant_hand ?? null,
        years_playing: profile.years_playing ?? null, usual_format: profile.usual_format ?? null,
        self_level: profile.self_level ?? null, is_adult_confirmed: !!profile.is_adult_confirmed,
      }); if (active && profile) setDefaults({
        default_review_mode: profile.default_review_mode ?? null, default_session_kind: profile.default_session_kind ?? null,
        default_play_format: profile.default_play_format ?? null,
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

  const initials = (form.display_name || account || "P").trim().slice(0, 1).toUpperCase();
  if (loading) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading profile…</p>;
  return <div className="space-y-6">
    <ScreenTitle title="Profile" />
    <div className="flex items-center gap-4">
      <span className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-extrabold" style={{ background: OPTIC, color: INK, fontFamily: DISPLAY_FONT }}>{initials}</span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold" style={{ color: INK }}>{form.display_name || "Player"}</p>
        {account && <p className="truncate text-sm" style={{ color: WHITE_DIM }}>{account}</p>}
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "#e6e8e3", color: INK }} title="Your player ID">
          Player ID <span className="font-mono">{playerCode(userId)}</span>
        </p>
      </div>
    </div>

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
    <a href="#/welcome" className="flex items-center justify-between rounded-3xl p-4 text-sm font-bold" style={{ background: OPTIC, color: INK }}>
      Update my game and starting skills <span aria-hidden="true">→</span>
    </a>

    <Card>
      <SectionTitle>Default settings</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Used to fill in new sessions. You can still change them each time.</p>
      <div className="mt-4 space-y-4">
        <div>
          <p className={labelClass} style={labelStyle}>How to review</p>
          <div className="flex flex-wrap gap-2">
            {([["self", "Rate my game"], ["video", "Video analysis"]] as const).map(([v, l]) =>
              <Chip key={v} selected={defaults.default_review_mode === v} onClick={() => setDefaults({ ...defaults, default_review_mode: defaults.default_review_mode === v ? null : v })}>{l}</Chip>)}
          </div>
        </div>
        <div>
          <p className={labelClass} style={labelStyle}>Kind of session</p>
          <div className="flex flex-wrap gap-2">
            {(["solo", "match", "tournament"] as SessionKind[]).map((k) =>
              <Chip key={k} selected={defaults.default_session_kind === k} onClick={() => setDefaults({ ...defaults, default_session_kind: defaults.default_session_kind === k ? null : k,
                default_play_format: k === "solo" ? (SOLO_FORMATS.includes(defaults.default_play_format as PlayFormat) ? defaults.default_play_format : null)
                  : defaults.default_play_format === "singles" || defaults.default_play_format === "doubles" ? defaults.default_play_format : null })}>{KIND_LABELS[k]}</Chip>)}
          </div>
        </div>
        <div>
          <p className={labelClass} style={labelStyle}>Format</p>
          <div className="flex flex-wrap gap-2">
            {(defaults.default_session_kind === "solo" ? SOLO_FORMATS : ["singles", "doubles"] as PlayFormat[]).map((f) =>
              <Chip key={f} selected={defaults.default_play_format === f} onClick={() => setDefaults({ ...defaults, default_play_format: defaults.default_play_format === f ? null : f })}>{FORMAT_LABELS[f]}</Chip>)}
          </div>
        </div>
        {defaultsMessage && <Notice tone={defaultsMessage.startsWith("Saved") ? "info" : "error"}>{defaultsMessage}</Notice>}
        <PrimaryButton type="button" tone="light" className="w-full" disabled={savingDefaults} onClick={() => void submitDefaults()}>
          {savingDefaults ? "Saving…" : "Save default settings"}
        </PrimaryButton>
      </div>
    </Card>

    <Card>
      <SectionTitle>Display</SectionTitle>
      <div className="mt-3"><LargeTextToggle /></div>
    </Card>

    <Card>
      <SectionTitle>Your data</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>What PicklePro stores, who can see it, how long it is kept and how to delete it.</p>
      <a href="#/privacy" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-bold underline" style={{ color: "#11804f" }}>Read about your data and privacy</a>
    </Card>

    {devLinks && <Card>
      <SectionTitle>Research tools</SectionTitle>
      <div className="mt-2 flex flex-col gap-2 text-sm font-semibold">{devLinks}</div>
    </Card>}

    {signOut && <div>
      <button type="button" onClick={signOut.onClick} title={signOut.warning}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold" style={{ border: `1px solid ${ROSE}40`, color: ROSE }}>
        <LogOut size={16} /> {signOut.label}
      </button>
      {signOut.warning && <p className="mt-2 text-center text-xs" style={{ color: WHITE_SUB }}>{signOut.warning}</p>}
    </div>}
    </div>
    </div>
  </div>;
}
