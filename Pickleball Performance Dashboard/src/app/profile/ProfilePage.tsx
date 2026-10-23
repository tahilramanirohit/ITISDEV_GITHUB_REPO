import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, CircleDot, Hand, LogOut, MapPin, Pencil, Settings, Users } from "lucide-react";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { useSessionsData, weekStreak } from "../sessions/sessionUi";
import { playerCode } from "../../lib/api/players";
import { Notice, PageHero, Sheet } from "../shell/primitives";
import { BORDER, INK, ROSE, WHITE, WHITE_DIM, WHITE_SUB, alpha } from "../theme";
import { ProfileAvatar } from "./ProfileAvatar";

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

  return <div>
    <PageHero mascot eyebrow={account} title="Profile" />
    <Sheet>
    <div className="space-y-6">
    {error && <Notice tone="error">{error}</Notice>}
    {/* Profile card in the style of a sports app: photo, name, ID, details and a stats row. */}
    <section className="rounded-[14px]" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-label="Your profile">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <ProfileAvatar sb={sb} path={profile?.avatar_path} name={name} size={72} />
          <div className="flex gap-2">
            <a href="#/profile/edit" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] px-4 text-sm font-bold" style={{ border: `1px solid var(--pp-line-strong)`, color: INK }}>
              <Pencil size={15} aria-hidden="true" /> Edit profile
            </a>
            <a href="#/settings" aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-[12px]" style={{ border: `1px solid var(--pp-line-strong)`, color: INK }}>
              <Settings size={17} aria-hidden="true" />
            </a>
          </div>
        </div>
        <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.01em]" style={{ color: INK }}>{name}</h2>
        <p className="text-sm" style={{ color: WHITE_DIM }}>{[profile?.self_level && `Level ${profile.self_level}`, profile?.years_playing != null && `${profile.years_playing} yr${profile.years_playing === 1 ? "" : "s"} playing`].filter(Boolean).join(" · ") || account}</p>
        {profile?.bio && <p className="mt-2 text-sm" style={{ color: INK }}>{profile.bio}</p>}
        {facts.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">
          {facts.map(({ icon: Icon, text }) => <li key={text} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--pp-surface-2)", color: INK }}>
            <Icon size={13} aria-hidden="true" /> {text}</li>)}
        </ul>}
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--pp-surface-2)", color: INK }} title="Your player ID">
          Player ID <span className="font-mono">{playerCode(userId)}</span>
        </p>
        {!profile?.avatar_path && !profile?.bio && <p className="mt-3 text-sm" style={{ color: WHITE_DIM }}>
          <a href="#/profile/edit" className="font-bold underline" style={{ color: INK }}>Add a photo and a short bio</a> to make this yours.
        </p>}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3" style={{ borderColor: BORDER }}>
          {[["Sessions", sessions.length], ["Rated", rated], ["Week streak", streak]].map(([label, value]) => (
            <div key={label as string}><p className="text-[13px]" style={{ color: WHITE_SUB }}>{label}</p><p className="text-xl font-extrabold tabular-nums" style={{ color: INK }}>{value}</p></div>
          ))}
        </div>
      </div>
    </section>

    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
    <section className="overflow-hidden rounded-[14px]" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-label="Profile links">
      {[["#/profile/edit", "Edit profile", "Photo, name, bio, home court and paddle"], ["#/settings", "Settings", "Default settings, display, research tools"],
        ["#/welcome", "My game and starting skills", "Level, goals and usual skill ratings"],
        ["#/progress", "Self-rated progress", "How your ratings change over time"], ["#/privacy", "Your data and privacy", "What is stored and how to delete it"]].map(([href, title, detail]) => (
        <a key={href} href={href} className="flex min-h-[56px] items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: BORDER }}>
          <span className="min-w-0"><span className="block text-sm font-semibold" style={{ color: INK }}>{title}</span><span className="block text-xs" style={{ color: WHITE_SUB }}>{detail}</span></span>
          <ChevronRight size={18} style={{ color: WHITE_SUB }} aria-hidden="true" />
        </a>
      ))}
    </section>

    {signOut && <div>
      <button type="button" onClick={signOut.onClick} title={signOut.warning}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ border: `1px solid ${alpha(ROSE, 25)}`, color: ROSE }}>
        <LogOut size={16} /> {signOut.label}
      </button>
      {signOut.warning && <p className="mt-2 text-center text-xs" style={{ color: WHITE_SUB }}>{signOut.warning}</p>}
    </div>}
    </div>
    </div>
    </Sheet>
  </div>;
}
