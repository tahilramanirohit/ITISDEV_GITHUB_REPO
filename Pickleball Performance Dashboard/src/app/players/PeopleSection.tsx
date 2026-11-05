import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarX, Check, ClipboardCheck, Handshake, MessageSquareText, Send, UserRoundPlus, X } from "lucide-react";
import {
  FORMAT_LABELS, PURPOSE_LABELS, cancelBuddySession, formatFreeTime, logBuddySessionHref, nextFreeTime, sendBuddyRequest, upcomingBuddySessions,
} from "../../lib/api/buddy";
import {
  cancelInvite, createInviteCode, inviteBuddyAsPartner, partnerErrorText, redeemCode, respondToInvite, unlinkPartner,
} from "../../lib/api/partners";
import { recentSessions, type Person } from "../../lib/coaching/people";
import {
  ACCENT_INK, ACTION, ACTION_SOFT, BORDER, GREEN, GREEN_BG, INK, INK_3, ON_ACTION, SURFACE_2, WHITE_DIM,
} from "../theme";
import { Card, PrimaryButton, SectionTitle, numStyle, pressable } from "../shell/primitives";
import { announceBuddyChange } from "../buddy/useBuddyBadge";
import { AddPartnerCard, Avatar, CancelSessionForm, RequestDetails, RequestForm, levelText, shortDate } from "./parts";
import type { Act, PlayersData, Section } from "./PlayersPage";

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[12px] px-2.5 py-2" style={{ background: SURFACE_2 }}>
    <dt className="text-[11px] leading-tight" style={{ color: INK_3 }}>{label}</dt>
    <dd className="mt-0.5 text-[17px] leading-none" style={{ ...numStyle, color: INK }}>{value}</dd>
  </div>;
}

/** One person you play or coach with: how you know them, what you've done together, and what to do next. */
function PersonCard({ sb, person: p, data, act, busyId, reload, onOpen }: {
  sb: SupabaseClient; person: Person; data: PlayersData; act: Act; busyId: string | null; reload: () => Promise<void>; onOpen: (s: Section) => void;
}) {
  const [panel, setPanel] = useState<"play" | "feedback" | "unlink" | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const listed = data.players.find((x) => x.player_id === p.id);
  const pendingWithThem = data.requests.some((r) => r.other_player_id === p.id && r.status === "pending");
  const partner = p.partner;
  const toggle = (next: typeof panel) => setPanel(panel === next ? null : next);
  const recent = recentSessions(data.sessions);

  return <Card>
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name={p.name} />
      <div className="min-w-[9rem] flex-1">
        <h3 className="text-base font-bold" style={{ color: INK }}>{p.name}</h3>
        <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(p.level)}
          {partner?.linked_at ? ` · partners since ${shortDate(partner.linked_at)}` : ""}{p.next ? ` · next ${formatFreeTime(p.next)}` : ""}</p>
      </div>
      <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={partner ? { background: ACTION_SOFT, color: ACCENT_INK } : { background: GREEN_BG, color: INK }}>
        {partner ? "Partner" : "Buddy"}</span>
    </div>

    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`You and ${p.name}`}>
      <Stat label="Games together" value={String(p.gamesTogether)} />
      <Stat label="Last played" value={p.lastPlayed ? shortDate(p.lastPlayed) : "—"} />
      <Stat label="You asked them" value={String(p.askedThem)} />
      <Stat label="They asked you" value={String(p.theyShared.length)} />
    </dl>

    <p className="mt-2 text-xs leading-snug" style={{ color: WHITE_DIM }}>
      {partner ? `${p.name} sees only the sessions you share, and only what you ask about.`
        : `${p.name} sees your Buddy listing only. Make them a partner to share sessions and ask for feedback.`}</p>

    {p.waitingOnYou.length > 0 && <a href={`#/shared/${p.waitingOnYou[0].session_id}`}
      className={`mt-3 flex min-h-[44px] items-center gap-2 rounded-[12px] px-3 text-sm font-bold ${pressable}`} style={{ background: ACTION_SOFT, color: INK }}>
      <MessageSquareText size={16} aria-hidden="true" style={{ color: ACCENT_INK }} />
      {p.name} asked for your feedback on {p.waitingOnYou[0].title}{p.waitingOnYou.length > 1 ? ` and ${p.waitingOnYou.length - 1} more` : ""}</a>}

    <div className="mt-3 flex flex-wrap gap-2">
      <PrimaryButton tone={panel === "play" ? "dark" : "light"} disabled={!listed || pendingWithThem} onClick={() => toggle("play")}
        title={!listed ? `${p.name} is not on the Buddy list right now` : pendingWithThem ? "A request between you is waiting for an answer" : undefined}>
        <UserRoundPlus size={18} aria-hidden="true" /> Ask to play</PrimaryButton>
      {partner
        ? <PrimaryButton tone={panel === "feedback" ? "dark" : "light"} onClick={() => toggle("feedback")}>
            <Send size={18} aria-hidden="true" /> Ask for feedback</PrimaryButton>
        : p.invite?.direction === "sent"
          ? <span className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-bold" style={{ background: GREEN_BG, color: INK }}>Partner invite sent</span>
          : p.invite
            ? <>
                <PrimaryButton disabled={busyId === p.invite.id} onClick={() => void act(p.invite!.id, () => respondToInvite(sb, p.invite!.id, true),
                  `You and ${p.name} are now partners.`)}><Check size={18} aria-hidden="true" /> Accept partner invite</PrimaryButton>
                <PrimaryButton tone="light" disabled={busyId === p.invite.id} onClick={() => void act(p.invite!.id, () => respondToInvite(sb, p.invite!.id, false))}>
                  <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
              </>
            : <PrimaryButton tone="light" disabled={busyId === `partner-${p.id}`} title="Share chosen sessions and get feedback on your game"
                onClick={() => void act(`partner-${p.id}`, () => inviteBuddyAsPartner(sb, p.id).catch((e) => { throw new Error(partnerErrorText(e)); }),
                  `Partner invite sent to ${p.name}. Once they accept, you can ask them for feedback.`)}>
                <Handshake size={18} aria-hidden="true" /> Invite as partner</PrimaryButton>}
      {p.theyShared.length > 0 && <PrimaryButton tone="light" onClick={() => onOpen("inbox")}>
        <MessageSquareText size={18} aria-hidden="true" /> Their sessions ({p.theyShared.length})</PrimaryButton>}
    </div>

    {!listed && <p className="mt-2 text-xs" style={{ color: WHITE_DIM }}>
      {data.buddyReady ? `${p.name} is not on the Buddy list right now, so Ask to play is off.` : "Confirm you're 18+ under Find to ask players to play."}</p>}

    {panel === "play" && listed && <RequestForm player={listed} onClose={() => setPanel(null)} onSend={async (purpose, format, slots, meetup) => {
      await sendBuddyRequest(sb, p.id, purpose, format, slots, meetup);
      setPanel(null);
      announceBuddyChange();
      await reload();
    }} />}

    {panel === "feedback" && partner && <div className="mt-3 rounded-[var(--radius-md)] p-3" style={{ border: `1px solid ${BORDER}` }}>
      <p className="text-sm font-bold" style={{ color: INK }}>Which session should {p.name} look at?</p>
      {recent.length === 0 ? <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Log a session first, then ask {p.name} about it.</p>
        : <ul className="mt-2 space-y-1.5" aria-label={`Ask ${p.name} about`}>
            {recent.map((s) => <li key={s.id}>
              <a href={`#/sessions/${s.id}?tab=plan&ask=${p.id}`} className={`flex min-h-[44px] items-center justify-between gap-3 rounded-[12px] px-3 text-sm ${pressable}`}
                style={{ background: SURFACE_2, color: INK }}>
                <span className="min-w-0 truncate font-bold">{s.title}</span>
                <span className="shrink-0 text-xs" style={{ color: INK_3 }}>{shortDate(s.session_date)}</span>
              </a></li>)}
          </ul>}
      <p className="mt-2 text-xs" style={{ color: WHITE_DIM }}>You pick up to 3 skills and whether to share the video. Your own ratings, journal and plan stay private.</p>
    </div>}

    {p.buddySessions.length > 0 && <div className="mt-4 space-y-3 border-t pt-3" style={{ borderColor: BORDER }}>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: INK_3 }}>Buddy sessions</p>
      {p.buddySessions.map((r) => <div key={r.id} className="rounded-[12px] p-3" style={{ background: SURFACE_2 }}>
        <RequestDetails r={r} />
        {cancelling === r.id
          ? <CancelSessionForm name={p.name} onKeep={() => setCancelling(null)} onConfirm={async (reason) => {
              await cancelBuddySession(sb, r.id, reason);
              setCancelling(null);
              announceBuddyChange();
              await reload();
            }} />
          : (() => {
              // Already logged: link to it instead of offering a second log. Cancelling only makes sense before it happens.
              const logged = data.sessions.find((s) => s.buddy_request_id === r.id);
              const ahead = nextFreeTime(r) !== null;
              return <div className="mt-3 flex flex-wrap items-center gap-2">
                {logged
                  ? <a href={`#/sessions/${logged.id}`} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold ${pressable}`}
                      style={{ background: GREEN_BG, color: INK }}><Check size={18} aria-hidden="true" /> Logged: {logged.title}</a>
                  : <a href={logBuddySessionHref(r)} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-extrabold ${pressable}`}
                      style={{ background: ACTION, color: ON_ACTION }}><ClipboardCheck size={18} aria-hidden="true" /> Log this session</a>}
                {ahead && !logged && <PrimaryButton tone="light" onClick={() => setCancelling(r.id)}>
                  <CalendarX size={18} aria-hidden="true" /> Cancel buddy session</PrimaryButton>}
              </div>;
            })()}
      </div>)}
    </div>}

    {partner && (panel === "unlink"
      ? <div className="mt-3 space-y-3 rounded-[var(--radius-md)] p-4" style={{ border: `1px solid ${BORDER}` }} role="group" aria-label={`Unlink ${p.name}`}>
          <p className="text-sm" style={{ color: INK }}>Unlink {p.name}? Sessions you shared with each other are hidden from both
            of you right away. Notes already left on your sessions stay with you. You stay buddies if you were.</p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton disabled={busyId === partner.id} onClick={() => void act(partner.id, async () => { await unlinkPartner(sb, partner.id); setPanel(null); },
              `You unlinked ${p.name}.`)}>{busyId === partner.id ? "Unlinking…" : "Unlink"}</PrimaryButton>
            <PrimaryButton tone="light" onClick={() => setPanel(null)}>Keep partner</PrimaryButton>
          </div>
        </div>
      : <button type="button" onClick={() => setPanel("unlink")} className="mt-2 min-h-[44px] text-sm font-semibold underline" style={{ color: WHITE_DIM }}>
          Unlink partner</button>)}
  </Card>;
}

/** Who sees what: the two levels of trust, said plainly. */
function PrivacyNote() {
  return <section aria-label="Who sees what" className="rounded-[18px] p-4" style={{ background: SURFACE_2, color: INK }}>
    <h2 className="text-[15px] font-extrabold">Who sees what</h2>
    <dl className="mt-2 space-y-2 text-sm">
      <div><dt className="font-bold">Buddy list (anyone 18+ who opens Find)</dt>
        <dd style={{ color: WHITE_DIM }}>Your name, level, a rounded game rating and what you're looking for, only while you're listed.</dd></div>
      <div><dt className="font-bold">Partner (only people you accepted)</dt>
        <dd style={{ color: WHITE_DIM }}>Only the sessions you choose to share, and only the skills you ask about, with or without the video. Never your
          journal, plan or other sessions. Unlink at any time.</dd></div>
    </dl>
  </section>;
}

/** My people: buddies and partners together, the next buddy session, and adding a partner by code. */
export function PeopleSection({ sb, data, people, act, busyId, reload, onOpen }: {
  sb: SupabaseClient; data: PlayersData; people: Person[]; act: Act; busyId: string | null; reload: () => Promise<void>; onOpen: (s: Section) => void;
}) {
  const coming = upcomingBuddySessions(data.requests)[0] ?? null;
  const codes = data.links.filter((l) => l.status === "pending" && l.direction === "sent" && !l.other_id);

  return <>
    {coming && <section aria-label="Coming up" className="rounded-[18px] p-4" style={{ background: ACTION_SOFT, color: INK }}>
      <p className="text-xs font-extrabold tracking-wide" style={{ color: ACCENT_INK }}>COMING UP · {formatFreeTime(coming.when).toUpperCase()}</p>
      <p className="mt-1.5 text-base font-extrabold">{PURPOSE_LABELS[coming.request.purpose]} with {coming.request.other_name}</p>
      <p className="mt-0.5 text-sm" style={{ color: WHITE_DIM }}>{[FORMAT_LABELS[coming.request.play_format], coming.request.location, coming.request.city].filter(Boolean).join(" · ")}</p>
      <a href={logBuddySessionHref(coming.request)} className={`mt-3 flex min-h-[48px] items-center justify-center rounded-full px-4 text-[15px] font-extrabold ${pressable}`}
        style={{ background: ACTION, color: ON_ACTION }}>Log this session</a>
      <p className="mt-1.5 text-center text-xs" style={{ color: WHITE_DIM }}>{coming.request.other_name}, the purpose, format and date are filled in for you</p>
    </section>}

    <section aria-labelledby="people-heading" className="space-y-3">
      <SectionTitle><span id="people-heading">My people</span></SectionTitle>
      {people.length === 0
        ? <Card><p className="text-sm" style={{ color: WHITE_DIM }}>No one yet. Find someone to play with, or add a partner you already
            know with a code below. Buddies you play with can become partners who give you feedback.</p>
            {data.buddyReady && <PrimaryButton className="mt-3" onClick={() => onOpen("find")}><UserRoundPlus size={18} aria-hidden="true" /> Find players</PrimaryButton>}</Card>
        : <ul className="space-y-3" aria-label="My people">
            {people.map((p) => <li key={p.id}>
              <PersonCard sb={sb} person={p} data={data} act={act} busyId={busyId} reload={reload} onOpen={onOpen} /></li>)}
          </ul>}
    </section>

    <AddPartnerCard codes={codes} busyId={busyId}
      onCreate={() => act("create", async () => { await createInviteCode(sb); })}
      onCancel={(id) => void act(id, () => cancelInvite(sb, id))}
      onRedeem={async (code) => {
        await redeemCode(sb, code);
        announceBuddyChange();
        await act("redeemed", async () => {}, "Linked. You are now partners.");
      }} />
    <PrivacyNote />
    <p className="text-center text-sm" style={{ color: WHITE_DIM }}>
      <span className="inline-flex items-center gap-1"><Handshake size={14} aria-hidden="true" style={{ color: GREEN }} /> Played with a buddy?</span>{" "}
      Invite them as a partner from their card, then ask for feedback on that game.</p>
  </>;
}
