import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useNavigate } from "react-router";
import { ArrowLeft, Camera, Trash2 } from "lucide-react";
import { getProfile, saveProfile, supportsProfileExtras, type PlayerProfile, type ProfileInput } from "../../lib/api/profile";
import { PhotoError, removeProfilePhoto, uploadProfilePhoto } from "../../lib/api/profilePhoto";
import { Card, Chip, Notice, PageHero, PrimaryButton, SectionTitle, Sheet, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { BORDER, DEEP, INK, ROSE, WHITE, WHITE_DIM, WHITE_SUB, YELLOW, YELLOW_INK } from "../theme";
import { ProfileAvatar } from "./ProfileAvatar";

const BIO_MAX = 160;
const HANDS = [["right", "Right"], ["left", "Left"], ["ambidextrous", "Both"]] as const;
const FORMATS = [["singles", "Singles"], ["doubles", "Doubles"], ["both", "Both"]] as const;

const empty: ProfileInput = {
  display_name: "", dominant_hand: null, years_playing: null, usual_format: null,
  self_level: null, is_adult_confirmed: false, bio: null, home_court: null, paddle: null,
};

export default function EditProfilePage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [form, setForm] = useState<ProfileInput>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<"" | "uploading" | "removing">("");
  const [photoError, setPhotoError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getProfile(sb, userId)
      .then((p) => {
        if (!active) return;
        setProfile(p);
        if (p) {
          setForm({ display_name: p.display_name ?? "", dominant_hand: p.dominant_hand ?? null, years_playing: p.years_playing ?? null,
            usual_format: p.usual_format ?? null, self_level: p.self_level ?? null, is_adult_confirmed: !!p.is_adult_confirmed,
            bio: p.bio ?? null, home_court: p.home_court ?? null, paddle: p.paddle ?? null });
          setPhotoPath(p.avatar_path ?? null);
        }
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sb, userId]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Without the edit-profile database update, only the original fields can be saved.
  const extras = supportsProfileExtras(profile);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    setPhotoBusy("uploading");
    setPreview(URL.createObjectURL(file));
    try {
      setPhotoPath(await uploadProfilePhoto(sb, userId, file, photoPath));
    } catch (e) {
      setPreview(null);
      setPhotoError(e instanceof PhotoError ? e.message : "The photo could not be uploaded. Check your connection and try again.");
    } finally {
      setPhotoBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto() {
    if (!photoPath) return;
    setPhotoError("");
    setPhotoBusy("removing");
    try {
      await removeProfilePhoto(sb, userId, photoPath);
      setPhotoPath(null);
      setPreview(null);
    } catch (e) {
      setPhotoError(e instanceof PhotoError ? e.message : "The photo could not be removed. Try again.");
    } finally { setPhotoBusy(""); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setSaving(true);
    const clean = (v: string | null | undefined) => v?.trim() || null;
    try {
      const base: ProfileInput = { display_name: form.display_name.trim(), dominant_hand: form.dominant_hand, years_playing: form.years_playing,
        usual_format: form.usual_format, self_level: clean(form.self_level), is_adult_confirmed: form.is_adult_confirmed };
      await saveProfile(sb, userId, extras ? { ...base, bio: clean(form.bio), home_court: clean(form.home_court), paddle: clean(form.paddle) } : base);
      navigate("/profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading profile…</p>;
  const textField = (key: "home_court" | "paddle", label: string, max: number, placeholder: string) => (
    <label className="grid min-w-0 gap-1 text-sm font-semibold">{label}
      <input maxLength={max} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
        className="w-full min-w-0 rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
    </label>
  );

  return <div>
    <PageHero eyebrow={<a href="#/profile" className="inline-flex items-center gap-1"><ArrowLeft size={14} aria-hidden="true" /> Profile</a>} title="Edit profile"
      subtitle="Only you can see your profile." />
    <Sheet>
      <div className="mx-auto max-w-2xl space-y-6">
        {extras ? <Card>
          <SectionTitle>Profile photo</SectionTitle>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="relative">
              <ProfileAvatar sb={sb} path={photoPath} name={form.display_name} size={104} preview={preview} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={!!photoBusy} aria-label={photoPath ? "Change profile photo" : "Add profile photo"}
                className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full disabled:opacity-60" style={{ background: DEEP, color: YELLOW, border: `3px solid ${WHITE}` }}>
                <Camera size={16} />
              </button>
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} disabled={!!photoBusy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-extrabold disabled:opacity-60" style={{ background: YELLOW, color: YELLOW_INK }}>
                <Camera size={16} aria-hidden="true" /> {photoBusy === "uploading" ? "Uploading…" : photoPath ? "Change photo" : "Add photo"}
              </button>
              {photoPath && <button type="button" onClick={() => void removePhoto()} disabled={!!photoBusy}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-bold disabled:opacity-60" style={{ border: `1px solid ${ROSE}40`, color: ROSE }}>
                <Trash2 size={15} aria-hidden="true" /> {photoBusy === "removing" ? "Removing…" : "Remove photo"}
              </button>}
            </div>
          </div>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <p className="mt-3 text-xs" style={{ color: WHITE_SUB }}>Take a photo or choose one. It is cropped square, made smaller, and saves straight away.</p>
          {photoError && <div className="mt-3"><Notice tone="error">{photoError}</Notice></div>}
        </Card> : <Notice tone="info">Profile photo, bio, home court and paddle appear here after the latest database update.</Notice>}

        <Card>
          <SectionTitle>About you</SectionTitle>
          {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
          <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Display name
              <input required maxLength={80} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
            </label>
            {extras && <>
              <label className="grid gap-1 text-sm font-semibold">
                <span className="flex justify-between gap-2">Bio <span className="font-normal tabular-nums" style={{ color: WHITE_SUB }}>{(form.bio ?? "").length}/{BIO_MAX}</span></span>
                <textarea rows={3} maxLength={BIO_MAX} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="e.g. Weekend doubles player working on my dinks" className="rounded-2xl px-4 py-3 text-base font-normal" style={fieldStyle} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {textField("home_court", "Home court", 80, "e.g. Rizal Park courts")}
                {textField("paddle", "Paddle", 60, "e.g. Joola Hyperion")}
              </div>
            </>}
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
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" className="flex-1" disabled={saving || !form.display_name.trim()}>{saving ? "Saving…" : "Save profile"}</PrimaryButton>
              <a href="#/profile" className="inline-flex min-h-[48px] items-center rounded-full px-6 text-sm font-bold" style={{ border: `1px solid ${BORDER}`, color: INK }}>Cancel</a>
            </div>
            <p className="text-xs" style={{ color: WHITE_DIM }}>Your details give context to your plans. They are not a skill rating.</p>
          </form>
        </Card>
      </div>
    </Sheet>
  </div>;
}
