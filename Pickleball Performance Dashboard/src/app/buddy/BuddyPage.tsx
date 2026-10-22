import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarPlus, CalendarX, Check, Clock, MapPin, Trash2, UserRoundPlus, X } from "lucide-react";
import {
  BUDDY_LEVELS, CANCEL_REASONS, FORMATS, FORMAT_LABELS, LEVEL_LABELS, MAX_CANCEL_REASON, MAX_CITY, MAX_DAYS_AHEAD, MAX_FREE_TIMES,
  MAX_LOCATION, PURPOSES, PURPOSE_LABELS, buddyErrorText, buddyLevel, cancelBuddySession, cancelRequest, formatFreeTime, freeTimeProblem, isoDate, listBuddyPlayers,
  listMyRequests, meetupProblem, respondToRequest, sendBuddyRequest, setBuddyVisible, sortByLevel,
  type BuddyFormat, type BuddyLevel, type BuddyPlayer, type BuddyPurpose, type BuddyRequest, type FreeTime, type Meetup,
} from "../../lib/api/buddy";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { BORDER, GREEN, GREEN_BG, INK, ROSE, WHITE, WHITE_DIM } from "../theme";
import {
  Card, Chip, Notice, PageHero, PrimaryButton, SectionTitle, SegmentedTabs, Sheet, fieldStyle, labelClass, labelStyle, tabPanelProps,
} from "../shell/primitives";
import { announceBuddyChange } from "./useBuddyBadge";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const levelText = (l: BuddyLevel | null) => (l ? LEVEL_LABELS[l] : "Level not set");

function Avatar({ name }: { name: string }) {
  return <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold"
    style={{ background: GREEN_BG, color: INK }}>{initials(name)}</span>;
}

/** A new free time: the same hours on the day after the previous one. */
function nextDay(s: FreeTime): FreeTime {
  const [y, m, d] = s.date.split("-").map(Number);
  return { ...s, date: y ? isoDate(new Date(y, m - 1, d + 1)) : s.date };
}

function emptyTime(): FreeTime {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return { date: isoDate(d), start: "17:00", end: "19:00" };
}

/** Purpose, format, where to meet and free times: what a player answers before asking someone to buddy up. */
function RequestForm({ player, onSend, onClose }: {
  player: BuddyPlayer; onClose: () => void;
  onSend: (purpose: BuddyPurpose, format: BuddyFormat, slots: FreeTime[], meetup: Meetup) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState<BuddyPurpose | null>(null);
  const [format, setFormat] = useState<BuddyFormat | null>(null);
  const [meetup, setMeetup] = useState<Meetup>({ city: "", location: "" });
  const [slots, setSlots] = useState<FreeTime[]>([emptyTime()]);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const today = isoDate(new Date());
  const lastDay = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + MAX_DAYS_AHEAD);
    return isoDate(d);
  }, []);

  const setSlot = (i: number, patch: Partial<FreeTime>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const issue = !purpose ? "Choose a purpose." : !format ? "Choose a format." : meetupProblem(meetup) ?? freeTimeProblem(slots);
    setProblem(issue);
    if (issue || !purpose || !format) return;
    setSending(true);
    try {
      await onSend(purpose, format, slots, meetup);
    } catch (err) {
      setProblem(buddyErrorText(err));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-[var(--radius-md)] p-4" style={{ border: `1px solid ${BORDER}` }}
      aria-label={`Buddy up with ${player.display_name}`}>
      <div>
        <p className={labelClass} style={labelStyle}>Purpose</p>
        <div className="flex flex-wrap gap-2">{PURPOSES.map((p) =>
          <Chip key={p} selected={purpose === p} onClick={() => setPurpose(p)}>{PURPOSE_LABELS[p]}</Chip>)}</div>
      </div>
      <div>
        <p className={labelClass} style={labelStyle}>Format</p>
        <div className="flex flex-wrap gap-2">{FORMATS.map((f) =>
          <Chip key={f} selected={format === f} onClick={() => setFormat(f)}>{FORMAT_LABELS[f]}</Chip>)}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="grid gap-1 text-sm font-bold">City
          <input value={meetup.city} maxLength={MAX_CITY} autoComplete="address-level2" placeholder="e.g. Makati"
            onChange={(e) => setMeetup({ ...meetup, city: e.target.value })}
            className="w-full min-w-0 px-3 py-2 text-base font-normal" style={fieldStyle} />
        </label>
        <label className="grid gap-1 text-sm font-bold">Location
          <input value={meetup.location} maxLength={MAX_LOCATION} placeholder="e.g. BGC Pickle Hub, court 3"
            onChange={(e) => setMeetup({ ...meetup, location: e.target.value })}
            className="w-full min-w-0 px-3 py-2 text-base font-normal" style={fieldStyle} />
        </label>
      </div>
      <fieldset>
        <legend className={labelClass} style={labelStyle}>When are you free?</legend>
        <ul className="space-y-2">
          {slots.map((s, i) => (
            <li key={i} className={`grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto] ${i > 0 ? "border-t pt-2" : ""}`}
              style={{ borderColor: BORDER }}>
              <label className="col-span-3 grid gap-1 text-sm font-bold sm:col-span-1">Date
                <input type="date" required min={today} max={lastDay} value={s.date} onChange={(e) => setSlot(i, { date: e.target.value })}
                  className="w-full min-w-0 px-3 py-2 text-base font-normal" style={fieldStyle} />
              </label>
              <label className="grid gap-1 text-sm font-bold">From
                <input type="time" required value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })}
                  className="w-full min-w-0 px-3 py-2 text-base font-normal" style={fieldStyle} />
              </label>
              <label className="grid gap-1 text-sm font-bold">To
                <input type="time" required value={s.end} onChange={(e) => setSlot(i, { end: e.target.value })}
                  className="w-full min-w-0 px-3 py-2 text-base font-normal" style={fieldStyle} />
              </label>
              <button type="button" onClick={() => setSlots(slots.filter((_, j) => j !== i))} disabled={slots.length === 1}
                aria-label={`Remove free time ${i + 1}`} title="Remove this time"
                className="inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] disabled:opacity-40"
                style={{ border: `1px solid ${BORDER}`, background: WHITE, color: INK }}><Trash2 size={18} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
        {slots.length < MAX_FREE_TIMES &&
          <button type="button" onClick={() => setSlots([...slots, nextDay(slots[slots.length - 1])])}
            className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-sm font-bold" style={{ color: GREEN }}>
            <CalendarPlus size={18} aria-hidden="true" /> Add another date or time
          </button>}
      </fieldset>
      {problem && <Notice tone="error">{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={sending}>{sending ? "Sending…" : `Send to ${player.display_name}`}</PrimaryButton>
        <PrimaryButton type="button" tone="light" onClick={onClose}>Cancel</PrimaryButton>
      </div>
    </form>
  );
}

function RequestDetails({ r }: { r: BuddyRequest }) {
  return (
    <div className="mt-2 space-y-1 text-sm" style={{ color: INK }}>
      <p><strong>{PURPOSE_LABELS[r.purpose]}</strong> · {FORMAT_LABELS[r.play_format]}</p>
      {(r.city || r.location) && <p className="flex items-start gap-1.5">
        <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span><span className="sr-only">Meet at: </span>{[r.location, r.city].filter(Boolean).join(", ")}</span></p>}
      <ul aria-label="Free times" className="space-y-0.5">
        {r.slots.map((s, i) => <li key={i} className="flex items-center gap-1.5" style={{ color: WHITE_DIM }}>
          <Clock size={14} aria-hidden="true" />{formatFreeTime(s)}</li>)}
      </ul>
    </div>
  );
}

/** Calling off an accepted session: an optional reason, typed or picked, that the other player sees. */
function CancelSessionForm({ name, onConfirm, onKeep }: {
  name: string; onKeep: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await onConfirm(reason);
    } catch (err) {
      setProblem(buddyErrorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-[var(--radius-md)] p-4" style={{ border: `1px solid ${BORDER}` }}
      aria-label={`Cancel buddy session with ${name}`}>
      <p className="text-sm" style={{ color: INK }}>{name} will see that you cancelled, and your reason if you add one.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
        {CANCEL_REASONS.map((r) => <Chip key={r} selected={reason === r} onClick={() => setReason(reason === r ? "" : r)}>{r}</Chip>)}
      </div>
      <label className="grid gap-1 text-sm font-bold">Reason (optional)
        <textarea rows={2} value={reason} maxLength={MAX_CANCEL_REASON} placeholder="e.g. Something came up at work"
          onChange={(e) => setReason(e.target.value)}
          className="w-full min-w-0 resize-y px-3 py-2 text-base font-normal" style={fieldStyle} />
      </label>
      <p className="text-xs" style={{ color: WHITE_DIM }} aria-live="polite">{reason.length}/{MAX_CANCEL_REASON} characters</p>
      {problem && <Notice tone="error">{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={busy}>{busy ? "Cancelling…" : "Cancel session"}</PrimaryButton>
        <PrimaryButton type="button" tone="light" onClick={onKeep}>Keep session</PrimaryButton>
      </div>
    </form>
  );
}

const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

/** First visit: confirm 18+ (required by the buddy finder's safety rules) and choose whether to be listed. */
function JoinCard({ onJoin }: { onJoin: (listed: boolean) => Promise<void> }) {
  const [adult, setAdult] = useState(false);
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <SectionTitle>Before you use Buddy</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>
        Buddy helps you find someone to practise or play with. Other players see only your name and level.
      </p>
      <label className="mt-4 flex items-start gap-3 text-base">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        I confirm I am 18 or older.
      </label>
      <label className="mt-3 flex items-start gap-3 text-base">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={listed} onChange={(e) => setListed(e.target.checked)} />
        Show me in the Buddy list so other players can ask me.
      </label>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <PrimaryButton className="mt-4" disabled={!adult || busy} onClick={async () => {
        setBusy(true);
        setError("");
        try {
          await onJoin(listed);
        } catch (e) {
          setError(buddyErrorText(e));
          setBusy(false);
        }
      }}>{busy ? "Saving…" : "Continue"}</PrimaryButton>
    </Card>
  );
}

export default function BuddyPage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const [profile, setProfile] = useState<PlayerProfile | null | undefined>(undefined);
  const [players, setPlayers] = useState<BuddyPlayer[] | null>(null);
  const [requests, setRequests] = useState<BuddyRequest[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<BuddyLevel | "all">("all");
  const [asking, setAsking] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // Until the player picks a tab, open on Requests when someone is waiting for an answer.
  const [tab, setTab] = useState<"available" | "requests" | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getProfile(sb, userId);
      setProfile(p);
      if (!p?.is_adult_confirmed) return;
      const [list, mine] = await Promise.all([listBuddyPlayers(sb), listMyRequests(sb)]);
      setPlayers(list);
      setRequests(mine);
      setError("");
    } catch (e) {
      setError(buddyErrorText(e));
    }
  }, [sb, userId]);

  useEffect(() => { void load(); }, [load]);

  const myLevel = buddyLevel(profile?.self_level);
  const visible = !!profile?.buddy_visible;
  const incoming = requests.filter((r) => r.direction === "incoming" && r.status === "pending");
  const buddies = requests.filter((r) => r.status === "accepted");
  const sent = requests.filter((r) => r.direction === "outgoing" && (r.status === "pending" || r.status === "declined"));
  const calledOff = requests.filter((r) => r.status === "called_off");
  const activeTab = tab ?? (incoming.length ? "requests" : "available");
  const shown = useMemo(() => sortByLevel((players ?? []).filter((p) => filter === "all" || p.level === filter), myLevel),
    [players, filter, myLevel]);

  async function act(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setActionError("");
    try {
      await fn();
      announceBuddyChange();
      await load();
    } catch (e) {
      setActionError(buddyErrorText(e));
    } finally {
      setBusyId(null);
    }
  }

  const hero = <PageHero eyebrow="Find a playing partner" title="Buddy"
    subtitle="Players who want a buddy, with their level. Ask someone, and they can accept or decline." />;

  if (profile === undefined && !error) return <>{hero}<p className="text-sm" style={{ color: WHITE_DIM }}>Loading…</p></>;
  if (error) return <>{hero}<Notice tone="warn">{error}</Notice></>;
  if (!profile?.is_adult_confirmed) {
    return <>{hero}<Sheet><JoinCard onJoin={async (listed) => {
      const { error: e } = await sb.from("profiles").update({ is_adult_confirmed: true, ...(listed ? { buddy_visible: true } : {}) }).eq("id", userId);
      if (e) throw new Error(e.message);
      await load();
    }} /></Sheet></>;
  }

  return <>
    {hero}
    <Sheet className="space-y-6">
      {actionError && <Notice tone="error">{actionError}</Notice>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="type-body-strong" style={{ color: INK }}>{visible ? "You are listed in Buddy" : "You are hidden from the Buddy list"}</p>
            <p className="text-sm" style={{ color: WHITE_DIM }}>
              {visible ? `Others see: ${profile.display_name} · ${levelText(myLevel)}` : "You can still ask others. Turn this on so others can ask you."}
            </p>
          </div>
          <PrimaryButton tone="light" disabled={busyId === "visible"}
            onClick={() => act("visible", () => setBuddyVisible(sb, userId, !visible))}>{visible ? "Hide me" : "Show me"}</PrimaryButton>
        </div>
        {!myLevel && <p className="mt-3 text-sm" style={{ color: INK }}>
          Your level is not set. <a href="#/profile/edit" className="font-bold underline" style={{ color: GREEN }}>Add it in Edit profile</a> so
          players can find a buddy at their level.</p>}
      </Card>

      <SegmentedTabs label="Buddy" idBase="buddy" value={activeTab} onChange={setTab} tabs={[
        { value: "available", label: "Available" },
        { value: "requests", label: "Requests", badge: incoming.length ? `${incoming.length} new` : undefined },
      ]} />

      {activeTab === "available" && <div {...tabPanelProps("buddy", "available")} className="space-y-3 outline-none">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by level">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All levels</Chip>
          {BUDDY_LEVELS.map((l) => <Chip key={l} selected={filter === l} onClick={() => setFilter(l)}>{LEVEL_LABELS[l]}</Chip>)}
        </div>
        {sentTo && <Notice>Request sent to {sentTo}. Follow it under Requests.</Notice>}
        {players === null ? <p className="text-sm" style={{ color: WHITE_DIM }}>Loading players…</p>
          : shown.length === 0 ? <Card><p className="text-sm" style={{ color: WHITE_DIM }}>
              {filter === "all" ? "No other players are listed yet. Ask your playing partners to open Buddy and show themselves."
                : `No ${LEVEL_LABELS[filter].toLowerCase()} players are listed right now.`}</p></Card>
          : <ul className="space-y-3" aria-label="Available players">
              {shown.map((p) => {
                const status = p.request_status === "accepted" ? "Buddies"
                  : p.request_status === "pending" && p.request_direction === "outgoing" ? "Request sent"
                  : p.request_status === "pending" ? "Wants to buddy up with you" : null;
                return <li key={p.player_id}><Card>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={p.display_name} />
                    <div className="min-w-[9rem] flex-1">
                      <p className="type-body-strong" style={{ color: INK }}>{p.display_name}</p>
                      <p className="text-sm" style={{ color: WHITE_DIM }}>
                        {levelText(p.level)}{p.usual_format ? ` · usually ${p.usual_format === "both" ? "singles and doubles" : p.usual_format}` : ""}
                      </p>
                    </div>
                    {status
                      ? <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: GREEN_BG, color: INK }}>{status}</span>
                      : asking !== p.player_id && <PrimaryButton onClick={() => { setAsking(p.player_id); setSentTo(null); }}>
                          <UserRoundPlus size={18} aria-hidden="true" /> Buddy up</PrimaryButton>}
                  </div>
                  {asking === p.player_id && <RequestForm player={p} onClose={() => setAsking(null)} onSend={async (purpose, format, slots, meetup) => {
                    await sendBuddyRequest(sb, p.player_id, purpose, format, slots, meetup);
                    setAsking(null);
                    setSentTo(p.display_name);
                    announceBuddyChange();
                    await load();
                  }} />}
                </Card></li>;
              })}
            </ul>}
      </div>}

      {activeTab === "requests" && <div {...tabPanelProps("buddy", "requests")} className="space-y-6 outline-none">
      {incoming.length > 0 && <section aria-labelledby="incoming-heading" className="space-y-3">
        <SectionTitle><span id="incoming-heading">Wants to buddy up with you ({incoming.length})</span></SectionTitle>
        <ul className="space-y-3">
          {incoming.map((r) => <li key={r.id}><Card>
            <div className="flex items-center gap-3">
              <Avatar name={r.other_name} />
              <div className="min-w-0">
                <p className="type-body-strong" style={{ color: INK }}>{r.other_name}</p>
                <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(r.other_level)}</p>
              </div>
            </div>
            <RequestDetails r={r} />
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton disabled={busyId === r.id} onClick={() => act(r.id, () => respondToRequest(sb, r.id, true))}>
                <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
              <PrimaryButton tone="light" disabled={busyId === r.id} onClick={() => act(r.id, () => respondToRequest(sb, r.id, false))}>
                <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
            </div>
          </Card></li>)}
        </ul>
      </section>}

      {buddies.length > 0 && <section aria-labelledby="buddies-heading" className="space-y-3">
        <SectionTitle><span id="buddies-heading">Your buddies</span></SectionTitle>
        <ul className="space-y-3">
          {buddies.map((r) => <li key={r.id}><Card>
            <div className="flex items-center gap-3">
              <Avatar name={r.other_name} />
              <div className="min-w-0">
                <p className="type-body-strong" style={{ color: INK }}>{r.other_name}</p>
                <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(r.other_level)} · {r.direction === "outgoing" ? "accepted your request" : "you accepted"}</p>
              </div>
            </div>
            <RequestDetails r={r} />
            {cancelling === r.id
              ? <CancelSessionForm name={r.other_name} onKeep={() => setCancelling(null)} onConfirm={async (reason) => {
                  await cancelBuddySession(sb, r.id, reason);
                  setCancelling(null);
                  announceBuddyChange();
                  await load();
                }} />
              : <PrimaryButton tone="light" className="mt-3" onClick={() => setCancelling(r.id)}>
                  <CalendarX size={18} aria-hidden="true" /> Cancel buddy session</PrimaryButton>}
          </Card></li>)}
        </ul>
      </section>}

      {sent.length > 0 && <section aria-labelledby="sent-heading" className="space-y-3">
        <SectionTitle><span id="sent-heading">Requests you sent</span></SectionTitle>
        <ul className="space-y-3">
          {sent.map((r) => <li key={r.id}><Card>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={r.other_name} />
              <div className="min-w-[9rem] flex-1">
                <p className="type-body-strong" style={{ color: INK }}>{r.other_name}</p>
                <p className="text-sm font-bold" style={{ color: r.status === "declined" ? ROSE : WHITE_DIM }}>
                  {r.status === "pending" ? "Waiting for an answer" : "Declined"}</p>
              </div>
              {r.status === "pending" && <PrimaryButton tone="light" disabled={busyId === r.id}
                onClick={() => act(r.id, () => cancelRequest(sb, r.id))}>Cancel request</PrimaryButton>}
            </div>
            <RequestDetails r={r} />
          </Card></li>)}
        </ul>
      </section>}
      {calledOff.length > 0 && <section aria-labelledby="called-off-heading" className="space-y-3">
        <SectionTitle><span id="called-off-heading">Cancelled sessions</span></SectionTitle>
        <ul className="space-y-3">
          {calledOff.map((r) => <li key={r.id}><Card>
            <div className="flex items-center gap-3">
              <Avatar name={r.other_name} />
              <div className="min-w-0">
                <p className="type-body-strong" style={{ color: INK }}>{r.other_name}</p>
                <p className="text-sm font-bold" style={{ color: ROSE }}>
                  {r.cancelled_by_me ? "You cancelled" : `${r.other_name} cancelled`}{r.cancelled_at ? ` · ${shortDate(r.cancelled_at)}` : ""}</p>
              </div>
            </div>
            <p className="mt-2 text-sm" style={{ color: INK }}>
              {r.cancel_reason ? <><strong>Reason:</strong> {r.cancel_reason}</> : <span style={{ color: WHITE_DIM }}>No reason given</span>}</p>
            <RequestDetails r={r} />
          </Card></li>)}
        </ul>
      </section>}
        {incoming.length + buddies.length + sent.length + calledOff.length === 0 && <Card><p className="text-sm" style={{ color: WHITE_DIM }}>
          No requests yet. Find someone under Available and tap Buddy up. Requests other players send you show here.</p></Card>}
      </div>}
    </Sheet>
  </>;
}
