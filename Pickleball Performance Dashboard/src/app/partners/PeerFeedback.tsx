import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Clock, MessageSquareText, Send, X } from "lucide-react";
import {
  formatVideoTime, inviteBuddyAsPartner, listNotes, listPartners, listSessionShares, partnerErrorText, shareSession, unshareSession,
  type PartnerLink, type PeerNote, type SessionShare,
} from "../../lib/api/partners";
import { initials } from "../../lib/api/players";
import { SKILL_INFO, type SelfRatings, type SelfSkill } from "../../lib/coaching/selfAssessment";
import { askSkillOrder, comparePeer, peerAuthors, type PeerRating } from "../../lib/coaching/peerFeedback";
import {
  ACCENT, ACCENT_INK, ACCENT_SOFT, ACTION, ACTION_EDGE, CHECK, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, SURFACE, SURFACE_2, WARN,
} from "../theme";
import { Chip, Notice, PreferenceSwitch, cardStyle, mascotUrl, numStyle, pressable } from "../shell/primitives";

function Avatar({ name }: { name: string }) {
  return <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold"
    style={{ background: ACCENT_SOFT, color: INK }}>{initials(name) || "?"}</span>;
}

/** A 1-5 rating as a short bar, so "You 4" and "Kyle 2" read at a glance. */
function RatingBar({ who, value, color }: { who: string; value: number | null; color: string }) {
  return <div className="grid grid-cols-[3.5rem_1fr_1.5rem] items-center gap-2 text-xs" style={{ color: INK_2 }}>
    <span className="truncate">{who}</span>
    <span className="h-2.5 overflow-hidden rounded-full" style={{ background: SURFACE_2 }}>
      <span className="block h-full rounded-full" style={{ width: `${((value ?? 0) / 5) * 100}%`, background: color }} /></span>
    <span className="text-right text-sm" style={{ ...numStyle, color: INK }}>{value ?? "–"}</span>
  </div>;
}

/** The bottom sheet for asking a partner to look at up to 3 skills. */
function AskSheet({ partners, shares, goalSkills, hasVideo, initialPartner, sessionTitle, onSend, onClose }: {
  sessionTitle: string; partners: PartnerLink[]; shares: SessionShare[]; goalSkills: SelfSkill[]; hasVideo: boolean; initialPartner: string | null;
  onSend: (partnerId: string, skills: SelfSkill[], withVideo: boolean) => Promise<void>; onClose: () => void;
}) {
  const existing = (id: string | null) => shares.find((s) => s.partner_id === id);
  const [partnerId, setPartnerId] = useState<string | null>(initialPartner ?? partners[0]?.other_id ?? null);
  const [skills, setSkills] = useState<SelfSkill[]>((existing(partnerId)?.focus_skills ?? goalSkills).slice(0, 1));
  const [withVideo, setWithVideo] = useState(hasVideo && (existing(partnerId)?.with_video ?? true));
  const [changing, setChanging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = partners.find((p) => p.other_id === partnerId)?.other_name ?? "Your partner";
  const order = useMemo(() => askSkillOrder(goalSkills), [goalSkills]);

  function pickPartner(id: string) {
    setPartnerId(id);
    const share = existing(id);
    setSkills((share?.focus_skills ?? goalSkills).slice(0, 1)); setWithVideo(hasVideo && (share?.with_video ?? true)); setChanging(false);
  }
  const toggle = (skill: SelfSkill) => setSkills([skill]);
  const nothingToDo = skills.length === 0;

  async function send() {
    if (!partnerId) return setError("Pick who to ask.");
    if (nothingToDo) return setError("Pick at least one skill for a ratings-only request.");
    setBusy(true);
    setError("");
    try {
      await onSend(partnerId, skills, withVideo);
    } catch (e) {
      setError(partnerErrorText(e));
      setBusy(false);
    }
  }

  const skillNames = skills.map((s) => SKILL_INFO[s].label.toLowerCase());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root?.focus();
    return () => { document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);

  // Rendered on <body> so the phone tab bar and page layers never cover it.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button type="button" aria-label="Close" className="pp-fade absolute inset-0 cursor-default" style={{ background: "rgba(5,10,7,.6)" }} onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
        if (e.key !== "Tab") return;
        const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }} role="dialog" aria-modal="true" aria-label="Ask for feedback" className="pp-sheet relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] px-4 pt-4"
        style={{ background: SURFACE, borderTop: `1px solid ${LINE_STRONG}`, paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: LINE_STRONG }} aria-hidden="true" />
        <div className="flex items-start justify-between gap-2"><div><h2 className="text-2xl font-extrabold" style={{ color: INK }}>Ask {name} for feedback</h2><p className="mt-1 text-base" style={{ color: INK_2 }}>On {sessionTitle}</p></div><button type="button" aria-label="Close feedback request" onClick={onClose} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center"><X size={20} /></button></div>
        {partners.length > 1 && <button type="button" className="min-h-[44px] text-sm font-bold underline" style={{ color: ACCENT_INK }} onClick={() => setChanging(!changing)}>Change</button>}
        {changing && <div className="flex flex-wrap gap-2" role="group" aria-label="Who">{partners.map((p) => <Chip key={p.id} selected={partnerId === p.other_id} onClick={() => pickPartner(p.other_id!)}>{p.other_name}</Chip>)}</div>}
        <h3 className="mt-5 text-xl font-extrabold leading-tight" style={{ color: INK }}>Which shot would you like feedback on?</h3>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Skills to look at">
          {order.map((s) => <Chip key={s} selected={skills.includes(s)} onClick={() => toggle(s)}>{SKILL_INFO[s].label}</Chip>)}
        </div>
        <div className="mt-4 rounded-[20px] px-4" style={{ ...cardStyle, background: SURFACE_2 }}>
          {hasVideo ? <PreferenceSwitch label="Share the video" detail="Your ratings, journal and plan stay private." checked={withVideo} onChange={() => setWithVideo(!withVideo)} disabled={busy} />
          : <p className="py-4 text-base" style={{ color: INK_2 }}>Ratings only. Your ratings, journal and plan stay private.</p>}
        </div>
        {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
        <button type="button" disabled={busy || !partnerId || nothingToDo} onClick={() => void send()}
          className={`mt-3 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full text-base font-extrabold ${pressable}`}
          style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
          <Send size={18} aria-hidden="true" />{busy ? "Sending…" : `Send to ${name}`}</button>
        {skillNames.length > 0 && <span className="sr-only">Asking about {skillNames.join(", ")}</span>}
      </div>
    </div>, document.body);
}

/**
 * Peer coaching on the owner's session (WP5): ask partners for feedback on chosen
 * skills, then see "You vs Kyle" per skill and their notes grouped by skill.
 */
export function PeerFeedback({ sb, sessionId, hasVideo, selfRatings, peerRatings, goalSkills, onWatch, onChanged, askFor = null, playedWith = null, sessionTitle = "this session" }: {
  sb: SupabaseClient; sessionId: string; hasVideo: boolean; sessionTitle?: string;
  selfRatings: SelfRatings | null; peerRatings: PeerRating[]; goalSkills: SelfSkill[];
  /** Open the Ask sheet for this partner straight away (from their card under Players). */
  askFor?: string | null;
  /** The buddy this session was played with: "Ask Jun for feedback?", or invite them as a partner first. */
  playedWith?: { id: string; name: string } | null;
  /** Jump the video to a note's moment. */
  onWatch?: (timeSeconds: number) => void;
  onChanged?: () => void;
}) {
  const [partners, setPartners] = useState<PartnerLink[] | null>(null);
  const [links, setLinks] = useState<PartnerLink[]>([]);
  const [inviting, setInviting] = useState(false);
  const [autoAsked, setAutoAsked] = useState(false);
  const [shares, setShares] = useState<SessionShare[]>([]);
  const [notes, setNotes] = useState<PeerNote[]>([]);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState<{ partner: string | null } | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [links, s, n] = await Promise.all([listPartners(sb), listSessionShares(sb, sessionId), listNotes(sb, sessionId)]);
      setLinks(links);
      setPartners(links.filter((l) => l.status === "active" && l.other_id));
      setShares(s);
      // Partners' feedback only: your own comments on the video (update 14) stay under the video.
      setNotes(n.filter((x) => !x.mine));
      setError("");
    } catch (e) {
      setPartners([]);
      setError(partnerErrorText(e));
    }
  }, [sb, sessionId]);
  useEffect(() => { void load(); }, [load]);

  // From a partner's card ("Ask for feedback" on a session): open the sheet for them once.
  useEffect(() => {
    if (autoAsked || !askFor || !partners) return;
    setAutoAsked(true);
    if (partners.some((p) => p.other_id === askFor)) setAsking({ partner: askFor });
  }, [askFor, partners, autoAsked]);

  const authors = useMemo(() => {
    const list = peerAuthors(peerRatings);
    for (const n of notes) if (!list.some((a) => a.id === n.author_id)) list.push({ id: n.author_id, name: n.author_name });
    return list;
  }, [peerRatings, notes]);

  if (partners === null) return null;
  const nameOf = (id: string) => partners.find((p) => p.other_id === id)?.other_name ?? "A former partner";
  const buddyLink = playedWith ? links.find((l) => l.other_id === playedWith.id) : undefined;
  const buddyIsPartner = buddyLink?.status === "active";
  const alreadyAsked = !!playedWith && shares.some((s) => s.partner_id === playedWith.id);
  const focusName = goalSkills[0] ? SKILL_INFO[goalSkills[0]].label.toLowerCase() : null;

  async function inviteBuddy() {
    if (!playedWith) return;
    setInviting(true);
    setError("");
    try {
      await inviteBuddyAsPartner(sb, playedWith.id);
      setNotice(`Video partner invite sent to ${playedWith.name}. Once they accept, ask them here.`);
      await load();
    } catch (e) {
      setError(partnerErrorText(e));
    } finally {
      setInviting(false);
    }
  }

  async function stop(partnerId: string) {
    try {
      await unshareSession(sb, sessionId, partnerId);
      setNotice(`Stopped sharing with ${nameOf(partnerId)}.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(partnerErrorText(e));
    }
  }

  return (
    <section id="peer-feedback" aria-label="Peer feedback" className="space-y-4 scroll-mt-6">
      {authors.map((a) => {
        const rows = comparePeer(selfRatings, peerRatings, a.id);
        const theirNotes = notes.filter((n) => n.author_id === a.id);
        const groups = [...new Set(theirNotes.map((n) => n.skill ?? null))];
        return <div key={a.id} className="rounded-[18px] p-4" style={cardStyle}>
          <div className="flex items-center gap-3">
            <Avatar name={a.name} />
            <div className="min-w-0">
              <h3 className="text-[15px] font-extrabold" style={{ color: INK }}>Feedback from {a.name}</h3>
              <p className="text-xs" style={{ color: INK_3 }}>Your partner's view, next to your own rating</p>
            </div>
          </div>
          {rows.length > 0 && <ul className="mt-3 space-y-3" aria-label={`You vs ${a.name}`}>
            {rows.map((r) => <li key={r.skill}>
              <p className="text-sm font-bold" style={{ color: INK }}>{r.label}</p>
              <div className="mt-1 space-y-1">
                <RatingBar who="You" value={r.self} color={INK_3} />
                <RatingBar who={a.name} value={r.peer} color={ACCENT} />
              </div>
              <p className="mt-1 text-xs font-bold" style={{ color: r.tone === "lower" ? WARN : r.tone === "agree" ? CHECK : INK_2 }}>{r.line}</p>
            </li>)}
          </ul>}
          {theirNotes.length > 0 && <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: LINE }}>
            {groups.map((g) => <div key={g ?? "general"}>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: INK_3 }}>
                <MessageSquareText size={13} aria-hidden="true" />{g ? SKILL_INFO[g].label : "General"}</p>
              <ul className="mt-1.5 space-y-1.5">
                {theirNotes.filter((n) => (n.skill ?? null) === g).map((n) => <li key={n.id} className="flex items-start gap-2 text-sm" style={{ color: INK }}>
                  {n.video_time_s != null && (onWatch
                    ? <button type="button" onClick={() => onWatch(n.video_time_s!)} aria-label={`Watch at ${formatVideoTime(n.video_time_s)}`}
                        className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-bold ${pressable}`}
                        style={{ background: ACCENT_SOFT, color: ACCENT_INK }}><Clock size={12} aria-hidden="true" />{formatVideoTime(n.video_time_s)}</button>
                    : <span className="shrink-0 pt-0.5 text-xs font-bold" style={{ color: ACCENT_INK }}>{formatVideoTime(n.video_time_s)}</span>)}
                  <span className="pt-1.5">{n.body}</span>
                </li>)}
              </ul>
            </div>)}
          </div>}
        </div>;
      })}

      {playedWith && !alreadyAsked && <div className="rounded-[18px] p-4" style={{ background: ACCENT_SOFT, color: INK }} role="note"
        aria-label={`Feedback from ${playedWith.name}`}>
        <p className="text-[15px] font-extrabold">You played with {playedWith.name}. Ask {playedWith.name} for feedback{focusName ? ` on your ${focusName}` : ""}?</p>
        {buddyIsPartner
          ? <button type="button" onClick={() => setAsking({ partner: playedWith.id })}
              className={`mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-[15px] font-extrabold ${pressable}`}
              style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
              <Send size={17} aria-hidden="true" /> Ask {playedWith.name}</button>
          : buddyLink?.status === "pending" && buddyLink.direction === "sent"
            ? <p className="mt-1 text-sm" style={{ color: INK_2 }}>Video partner invite sent. Once {playedWith.name} accepts, you can ask here.</p>
            : buddyLink?.status === "pending"
              ? <p className="mt-1 text-sm" style={{ color: INK_2 }}>{playedWith.name} invited you to be video partners. <a href="#/players?section=partners"
                  className="font-bold underline" style={{ color: ACCENT_INK }}>Answer in Players → My partners</a>, then ask here.</p>
              : <>
                  <p className="mt-1 text-sm" style={{ color: INK_2 }}>You and {playedWith.name} are buddies. Partner for video feedback first: they
                    accept once, then you can ask about any session you share.</p>
                  <button type="button" disabled={inviting} onClick={() => void inviteBuddy()}
                    className={`mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-[15px] font-extrabold ${pressable}`}
                    style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
                    {inviting ? "Sending…" : `Partner with ${playedWith.name} for video feedback`}</button>
                </>}
      </div>}

      <div className="rounded-[18px] p-4" style={cardStyle}>
        <div className="flex items-start gap-3">
          <img src={mascotUrl} alt="" aria-hidden="true" className="h-12 w-9 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold" style={{ color: INK }}>Get a partner's view</h3>
            <p className="mt-0.5 text-[13px]" style={{ color: INK_2 }}>Ask someone you trust to rate a skill{hasVideo ? " and leave notes on the video" : ""}. Your own ratings, journal and plan stay private.</p>
          </div>
        </div>
        {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
        {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
        {shares.length > 0 && <ul className="mt-3 space-y-2" aria-label="Shared with">
          {shares.map((s) => <li key={s.partner_id} className="flex flex-wrap items-center gap-2 rounded-[14px] p-3" style={{ background: SURFACE_2 }}>
            <span className="min-w-[8rem] flex-1 text-sm" style={{ color: INK }}><b>{nameOf(s.partner_id)}</b>
              <span className="block text-xs" style={{ color: INK_2 }}>
                {s.focus_skills.length ? s.focus_skills.map((k) => SKILL_INFO[k].label).join(" · ") : "No skills picked"} · {s.with_video ? "with video" : "ratings only"}</span></span>
            <button type="button" onClick={() => setAsking({ partner: s.partner_id })} className={`min-h-[44px] rounded-full px-3 text-sm font-bold ${pressable}`}
              style={{ color: ACCENT_INK }}>Change</button>
            <button type="button" onClick={() => void stop(s.partner_id)} className={`min-h-[44px] rounded-full px-3 text-sm font-bold ${pressable}`}
              style={{ color: INK_2 }} aria-label={`Stop sharing with ${nameOf(s.partner_id)}`}>Stop sharing</button>
          </li>)}
        </ul>}
        {partners.length === 0 && !error
          ? <p className="mt-3 text-sm" style={{ color: INK_2 }}>No video partners yet. <a href="#/players?section=partners" className="font-bold underline" style={{ color: ACCENT_INK }}>Partner with a buddy under Players</a> first.</p>
          : !error && <button type="button" onClick={() => setAsking({ partner: null })}
              className={`mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-[15px] font-extrabold ${pressable}`}
              style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}>
              <Send size={17} aria-hidden="true" /> Ask for feedback</button>}
      </div>

      {asking && partners.length > 0 && <AskSheet partners={partners} shares={shares} goalSkills={goalSkills} hasVideo={hasVideo}
        sessionTitle={sessionTitle} initialPartner={asking.partner ?? (partners.some((p) => p.other_id === playedWith?.id) ? playedWith!.id : null)} onClose={() => setAsking(null)}
        onSend={async (partnerId, skills, withVideo) => {
          await shareSession(sb, sessionId, partnerId, skills, withVideo);
          setAsking(null);
          setNotice(`Sent to ${nameOf(partnerId)}. You both find it under Players → Shared.`);
          await load();
          onChanged?.();
        }} />}
    </section>
  );
}
