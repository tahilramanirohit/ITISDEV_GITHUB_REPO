import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarChart3, ChevronRight, CircleDot, Flame, Hand, LogOut, MapPin, Pencil, Settings, ShieldCheck, Star, Users } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { useSessionsData, weekStreak } from "../sessions/sessionUi";
import { playerCode } from "../../lib/api/players";
import { Notice, numStyle } from "../shell/primitives";
import { ACTION, BORDER, CHECK, HERO, INK, ON_ACTION, ON_CHECK, ON_HERO, ROSE, WHITE, WHITE_SUB, alpha } from "../theme";
import { ProfileAvatar } from "./ProfileAvatar";
import { experienceLabel } from "../onboarding/experience";

const HAND_LABEL = { right: "Right-handed", left: "Left-handed", ambidextrous: "Plays with both hands" } as const;
const FORMAT_LABEL = { singles: "Singles", doubles: "Doubles", both: "Singles and doubles" } as const;

export default function ProfilePage({ sb, userId, account, signOut }: {
  sb: SupabaseClient; userId: string; account?: string;
  signOut?: { label: string; onClick: () => void; warning?: string };
}) {
  const { items, assessments } = useSessionsData(sb);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getProfile(sb, userId)
      .then((p) => { if (active) setProfile(p); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sb, userId]);

  const name = profile?.display_name || "Player";
  const sessions = items ?? [];
  const rated = sessions.filter((i) => assessments.some((x) => x.session_id === i.session.id)).length;
  const streak = weekStreak(sessions.map((i) => i.session.session_date));
  const facts = [
    profile?.home_court && { icon: MapPin, text: profile.home_court },
    profile?.paddle && { icon: CircleDot, text: `Paddle: ${profile.paddle}` },
    profile?.dominant_hand && { icon: Hand, text: HAND_LABEL[profile.dominant_hand] },
    profile?.usual_format && { icon: Users, text: FORMAT_LABEL[profile.usual_format] },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];
  if (loading) return <p className="text-sm" style={{ color: WHITE_SUB }}>Loading profile…</p>;

  const links = [
    ["#/profile/edit", Pencil, "Edit profile", "Photo, name, bio, home court and paddle"],
    ["#/settings", Settings, "Settings", "Default settings, display, research tools"],
    ["#/welcome", Star, "My game and starting skills", "Level, goals and usual skill ratings"],
    ["#/progress", BarChart3, "Self-rated progress", "How your ratings change over time"],
    ["#/privacy", ShieldCheck, "Your data and privacy", "What is stored and how to delete it"],
  ] as const;

  return <div>
    {/* Design B: the top bar's dark band ends just below it; the profile itself is the dark card. */}
    <div aria-hidden="true" className="-mx-4 -mt-5 mb-5 h-6 rounded-b-[30px] md:-mx-6 md:-mt-6 lg:-mx-10 lg:-mt-8 desktop:hidden" style={{ background: HERO }} />
    <h1 className="sr-only">Profile</h1>
    <div className="space-y-5">
    {error && <Notice tone="error">{error}</Notice>}
    <section className="grid justify-items-center gap-3 rounded-[22px] px-4 py-6 text-center" style={{ background: HERO, color: ON_HERO }} aria-label="Your profile">
      <ProfileAvatar sb={sb} path={profile?.avatar_path} name={name} size={84} />
      <div>
        <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.01em]">{name}</h2>
        <p className="mt-0.5 text-base" style={{ color: "#c6d3ca" }}>{[profile?.self_level && `Level ${profile.self_level}`, profile?.years_playing != null && `Playing ${experienceLabel(profile.years_playing)!.toLowerCase()}`].filter(Boolean).join(" · ") || "Add your level in Edit profile"}</p>
      </div>
      {profile?.bio && <p className="max-w-md text-base" style={{ color: ON_HERO }}>{profile.bio}</p>}
      {facts.length > 0 && <ul className="flex flex-wrap justify-center gap-2">
        {facts.map(({ icon: Icon, text }) => <li key={text} className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 text-sm font-bold" style={{ background: ACTION, color: ON_ACTION }}>
          <Icon size={14} aria-hidden="true" /> {text}</li>)}
      </ul>}
      <p className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-sm font-bold" style={{ background: "#22342a", color: ON_HERO }} title="Your player ID">
        Your player ID: <span className="font-mono">{playerCode(userId)}</span>
      </p>
      {account && <p className="text-sm" style={{ color: "#c6d3ca" }}>Signed in as {account}</p>}
      {!profile?.avatar_path && !profile?.bio && <a href="#/profile/edit" className="inline-flex min-h-[44px] items-center text-sm font-bold underline" style={{ color: ACTION }}>Add a photo and a short bio</a>}
    </section>

    <section aria-label="Your numbers" className="grid grid-cols-2 gap-3">
      <div className="rounded-[22px] p-4" style={{ background: ACTION, color: ON_ACTION }}>
        <p className="text-sm font-bold">Sessions</p>
        <p className="mt-1 text-[44px] leading-none" style={numStyle}>{sessions.length}</p>
        <p className="mt-1 text-sm">{rated} rated</p>
      </div>
      <div className="rounded-[22px] p-4" style={{ background: CHECK, color: ON_CHECK }}>
        <p className="flex items-center gap-1.5 text-sm font-bold"><Flame size={16} aria-hidden="true" />Week streak</p>
        <p className="mt-1 text-[44px] leading-none" style={numStyle}>{streak}</p>
        <p className="mt-1 text-sm">{streak === 1 ? "week" : "weeks"} in a row</p>
      </div>
    </section>

    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
    <nav aria-label="Profile links" className="overflow-hidden rounded-[20px]" style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: `inset 5px 0 0 ${ACTION}` }}>
      {links.map(([href, Icon, title, detail]) => (
        <a key={href} href={href} className="flex min-h-[64px] items-center gap-3 border-b py-3 pl-4 pr-3 last:border-b-0" style={{ borderColor: BORDER }}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px]" style={{ background: "color-mix(in srgb, var(--pp-green) 16%, var(--pp-surface))", color: CHECK }}><Icon size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-bold" style={{ color: INK }}>{title}</span><span className="block text-sm" style={{ color: WHITE_SUB }}>{detail}</span></span>
          <ChevronRight size={18} style={{ color: WHITE_SUB }} aria-hidden="true" />
        </a>
      ))}
    </nav>

    {signOut && <div>
      <button type="button" onClick={signOut.onClick} title={signOut.warning}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ border: `1px solid ${alpha(ROSE, 25)}`, color: ROSE }}>
        <LogOut size={16} /> {signOut.label}
      </button>
      {signOut.warning && <p className="mt-2 text-center text-xs" style={{ color: WHITE_SUB }}>{signOut.warning}</p>}
    </div>}
    </div>
    </div>
  </div>;
}
