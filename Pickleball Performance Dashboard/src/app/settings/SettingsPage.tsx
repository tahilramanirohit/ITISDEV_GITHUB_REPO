import { useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getProfile, saveSessionDefaults, type SessionDefaults } from "../../lib/api/profile";
import { friendlyDbError } from "../../lib/api/selfAssessment";
import { FORMAT_LABELS, KIND_LABELS, SOLO_FORMATS, type PlayFormat, type SessionKind } from "../../lib/api/types";
import { Card, Chip, Notice, PageHero, PrimaryButton, SectionTitle, Sheet, labelClass, labelStyle } from "../shell/primitives";
import { LargeTextToggle } from "../shell/AppShell";
import { BORDER, INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";

function LinkRow({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <a href={href} className="flex min-h-[56px] items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: BORDER }}>
      <span className="min-w-0"><span className="block text-sm font-semibold" style={{ color: INK }}>{title}</span>
        <span className="block text-xs" style={{ color: WHITE_SUB }}>{detail}</span></span>
      <ChevronRight size={18} style={{ color: WHITE_SUB }} aria-hidden="true" />
    </a>
  );
}

/** App settings: defaults for new sessions, display, data and research tools. */
export default function SettingsPage({ sb, userId, account, devLinks }: {
  sb: SupabaseClient; userId: string; account?: string; devLinks?: ReactNode;
}) {
  const [defaults, setDefaults] = useState<SessionDefaults>({ default_review_mode: null, default_session_kind: null, default_play_format: null });
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");
  useEffect(() => {
    let active = true;
    getProfile(sb, userId).then((profile) => {
      if (active && profile) setDefaults({
        default_review_mode: profile.default_review_mode ?? null, default_session_kind: profile.default_session_kind ?? null,
        default_play_format: profile.default_play_format ?? null,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [sb, userId]);

  async function submitDefaults() {
    setSavingDefaults(true); setDefaultsMessage("");
    try {
      await saveSessionDefaults(sb, userId, defaults);
      setDefaultsMessage("Saved. New sessions start with these settings.");
    } catch (e) {
      setDefaultsMessage(friendlyDbError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally { setSavingDefaults(false); }
  }

  return <div>
    <PageHero eyebrow={<a href="#/profile" className="inline-flex items-center gap-1"><ArrowLeft size={14} /> Profile</a>} title="Settings" subtitle={account} />
    <Sheet>
    <div className="space-y-6">
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
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
    <div className="space-y-6">
    <Card>
      <SectionTitle>Display</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Make all text larger on this device.</p>
      <div className="mt-3"><LargeTextToggle /></div>
    </Card>
    <section className="overflow-hidden rounded-2xl" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-label="More settings">
      <LinkRow href="#/welcome" title="My game and starting skills" detail="Level, goals and your usual skill ratings" />
      <LinkRow href="#/privacy" title="Your data and privacy" detail="What is stored, who can see it, how to delete it" />
    </section>
    {devLinks && <Card>
      <SectionTitle>Research tools</SectionTitle>
      <div className="mt-2 flex flex-col gap-2 text-sm font-semibold">{devLinks}</div>
    </Card>}
    <p className="text-xs" style={{ color: WHITE_SUB }}>PicklePro research prototype · DLSU CAPIT-01</p>
    </div>
    </div>
    </div>
    </Sheet>
  </div>;
}
