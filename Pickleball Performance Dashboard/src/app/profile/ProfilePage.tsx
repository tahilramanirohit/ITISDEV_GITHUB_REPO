import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile, saveProfile, type ProfileInput } from "../../lib/api/profile";
import { Card, Notice } from "../shell/primitives";
import { BLUE_SKY, WHITE_DIM } from "../theme";

const empty: ProfileInput = {
  display_name: "", dominant_hand: null, years_playing: null, usual_format: null,
  self_level: null, is_adult_confirmed: false,
};

export default function ProfilePage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const [form, setForm] = useState<ProfileInput>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getProfile(sb, userId)
      .then((profile) => { if (active && profile) setForm({
        display_name: profile.display_name, dominant_hand: profile.dominant_hand,
        years_playing: profile.years_playing, usual_format: profile.usual_format,
        self_level: profile.self_level, is_adult_confirmed: profile.is_adult_confirmed,
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

  if (loading) return <p>Loading profile…</p>;
  return <Card accent={BLUE_SKY}>
    <h1 className="text-2xl font-bold">Player profile</h1>
    <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Your self-declared details are private to your account. They are context, not a skill rating.</p>
    {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    {saved && <div className="mt-4"><Notice tone="info">Profile saved.</Notice></div>}
    <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4 max-w-xl">
      <label className="grid gap-1 text-sm font-semibold">Display name
        <input required maxLength={80} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          className="rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Dominant hand
        <select value={form.dominant_hand ?? ""} onChange={(e) => setForm({ ...form, dominant_hand: e.target.value as ProfileInput["dominant_hand"] || null })}
          className="rounded-lg border px-3 py-2 font-normal">
          <option value="">Prefer not to say</option><option value="right">Right</option><option value="left">Left</option><option value="ambidextrous">Both</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">Years playing
        <input type="number" min="0" max="99" step="0.1" value={form.years_playing ?? ""}
          onChange={(e) => setForm({ ...form, years_playing: e.target.value === "" ? null : Number(e.target.value) })}
          className="rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Usual format
        <select value={form.usual_format ?? ""} onChange={(e) => setForm({ ...form, usual_format: e.target.value as ProfileInput["usual_format"] || null })}
          className="rounded-lg border px-3 py-2 font-normal">
          <option value="">Not set</option><option value="singles">Singles</option><option value="doubles">Doubles</option><option value="both">Both</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">Self-declared level
        <input maxLength={40} value={form.self_level ?? ""} onChange={(e) => setForm({ ...form, self_level: e.target.value || null })}
          placeholder="Optional, in your own words" className="rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.is_adult_confirmed} onChange={(e) => setForm({ ...form, is_adult_confirmed: e.target.checked })} />
        <span>I confirm I am at least 18 years old. This does not make my profile visible to others.</span>
      </label>
      <button type="submit" disabled={saving || !form.display_name.trim()} className="rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        style={{ background: BLUE_SKY, color: "white" }}>{saving ? "Saving…" : "Save profile"}</button>
    </form>
  </Card>;
}
