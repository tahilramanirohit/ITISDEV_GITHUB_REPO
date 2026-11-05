// Pieces shared by the Players tab's sections: forms and cards moved from the
// former Buddy and Partners pages, unchanged in behaviour.
import { useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Check, Clock, Copy, KeyRound, Link2, MapPin, Trash2 } from "lucide-react";
import {
  CANCEL_REASONS, FORMATS, FORMAT_LABELS, LEVEL_LABELS, MAX_CANCEL_REASON, MAX_CITY, MAX_DAYS_AHEAD, MAX_FREE_TIMES,
  MAX_LOCATION, PURPOSES, PURPOSE_LABELS, buddyErrorText, formatFreeTime, freeTimeProblem, isoDate, meetupProblem,
  type BuddyFormat, type BuddyLevel, type BuddyPurpose, type BuddyRequest, type FreeTime, type Meetup,
} from "../../lib/api/buddy";
import { formatCode, partnerErrorText, type PartnerLink } from "../../lib/api/partners";
import { BORDER, GREEN, GREEN_BG, INK, WHITE, WHITE_DIM } from "../theme";
import { Card, Chip, Notice, PrimaryButton, SectionTitle, fieldStyle, labelClass, labelStyle } from "../shell/primitives";

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
export const levelText = (l: BuddyLevel | null) => (l ? LEVEL_LABELS[l] : "Level not set");
export const SHORT_PURPOSE: Record<BuddyPurpose, string> = { practice: "Practice", casual_game: "Casual game", competition: "Competition prep" };

/** "Practice · Competition prep" tags under a player's name. */
export function LookingFor({ list }: { list: readonly BuddyPurpose[] }) {
  if (!list.length) return null;
  return <span className="mt-1 flex flex-wrap gap-1.5" aria-label={`Looking for ${list.map((l) => SHORT_PURPOSE[l]).join(", ")}`}>
    {list.map((l) => <span key={l} className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: GREEN_BG, color: INK }}>{SHORT_PURPOSE[l]}</span>)}
  </span>;
}

export function Avatar({ name }: { name: string }) {
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
export function RequestForm({ player, onSend, onClose }: {
  player: { display_name: string }; onClose: () => void;
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

export function RequestDetails({ r }: { r: BuddyRequest }) {
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
export function CancelSessionForm({ name, onConfirm, onKeep }: {
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


export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

/** First visit: confirm 18+ (required by the buddy finder's safety rules) and choose whether to be listed. */
export function JoinCard({ onJoin }: { onJoin: (listed: boolean) => Promise<void> }) {
  const [adult, setAdult] = useState(false);
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Card>
      <SectionTitle>Before you find players</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>
        Find someone to practise or play with. If you're listed, other players see your name, level, a rounded game rating
        and what you're looking for. Nothing else.
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

/** Make a one-time code, or link with someone else's code. */
export function AddPartnerCard({ codes, onCreate, onRedeem, onCancel, busyId }: {
  codes: PartnerLink[]; busyId: string | null;
  onCreate: () => Promise<void>; onRedeem: (code: string) => Promise<void>; onCancel: (id: string) => void;
}) {
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function redeem(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setProblem("Enter the code your partner sent you.");
    setLinking(true);
    setProblem(null);
    try {
      await onRedeem(code);
      setCode("");
    } catch (err) {
      setProblem(partnerErrorText(err));
    } finally {
      setLinking(false);
    }
  }

  async function copy(c: string) {
    try {
      await navigator.clipboard.writeText(formatCode(c));
      setCopied(c);
    } catch {
      setCopied(null); // The code is on screen to copy by hand.
    }
  }

  return (
    <Card>
      <SectionTitle>Add a partner</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>
        Send a code to someone you trust, such as your doubles partner. A code works once and lasts 7 days.
      </p>
      <PrimaryButton className="mt-3" disabled={busyId === "create"} onClick={() => void onCreate()}>
        <KeyRound size={18} aria-hidden="true" /> {busyId === "create" ? "Creating…" : "Create an invite code"}</PrimaryButton>
      {codes.length > 0 && <ul className="mt-3 space-y-2" aria-label="Your unused invite codes">
        {codes.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] p-3"
          style={{ border: `1px solid ${BORDER}` }}>
          <div className="min-w-[9rem] flex-1">
            <p className="font-mono text-xl font-bold tracking-wider" style={{ color: INK }}>{formatCode(c.invite_code ?? "")}</p>
            <p className="text-sm" style={{ color: WHITE_DIM }}>Valid until {shortDate(c.expires_at)} · works once</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton tone="light" onClick={() => void copy(c.invite_code ?? "")}>
              {copied === c.invite_code ? <><Check size={18} aria-hidden="true" /> Copied</> : <><Copy size={18} aria-hidden="true" /> Copy</>}
            </PrimaryButton>
            <PrimaryButton tone="light" disabled={busyId === c.id} onClick={() => onCancel(c.id)}
              aria-label={`Cancel code ${formatCode(c.invite_code ?? "")}`}>Cancel</PrimaryButton>
          </div>
        </li>)}
      </ul>}
      <form onSubmit={redeem} className="mt-5 border-t pt-4" style={{ borderColor: BORDER }}>
        <label className="grid gap-1 text-sm font-bold" style={{ color: INK }}>Have a code?
          <div className="flex flex-wrap gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. K7P4-QX9M" autoComplete="off"
              autoCapitalize="characters" spellCheck={false} maxLength={20}
              className="min-w-0 flex-1 px-3 py-2 font-mono text-base font-normal" style={fieldStyle} />
            <PrimaryButton type="submit" disabled={linking}><Link2 size={18} aria-hidden="true" /> {linking ? "Linking…" : "Link"}</PrimaryButton>
          </div>
        </label>
        {problem && <div className="mt-2"><Notice tone="error">{problem}</Notice></div>}
      </form>
    </Card>
  );
}
