import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronRight, Copy, KeyRound, Link2, MessageSquareText, X } from "lucide-react";
import { LEVEL_LABELS } from "../../lib/api/buddy";
import { initials } from "../../lib/api/players";
import {
  cancelInvite, createInviteCode, formatCode, listPartners, listSharedWithMe, partnerErrorText, redeemCode, respondToInvite,
  unlinkPartner, type PartnerLink, type SharedSession,
} from "../../lib/api/partners";
import { CONTEXT_LABELS, FORMAT_LABELS } from "../../lib/api/types";
import { BORDER, GREEN, GREEN_BG, INK, ROSE, WHITE_DIM } from "../theme";
import {
  Card, Notice, PageHero, PrimaryButton, SectionTitle, SegmentedTabs, Sheet, fieldStyle, tabPanelProps,
} from "../shell/primitives";
import { announceBuddyChange } from "../buddy/useBuddyBadge";

const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function PartnerAvatar({ name }: { name: string }) {
  return <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold"
    style={{ background: GREEN_BG, color: INK }}>{initials(name) || "?"}</span>;
}

function levelLine(p: PartnerLink) {
  return p.other_level ? LEVEL_LABELS[p.other_level] : "Level not set";
}

/** Make a one-time code, or link with someone else's code. */
function AddPartnerCard({ codes, onCreate, onRedeem, onCancel, busyId }: {
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

export default function PartnersPage({ sb }: { sb: SupabaseClient; userId: string }) {
  const [links, setLinks] = useState<PartnerLink[] | null>(null);
  const [shared, setShared] = useState<SharedSession[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"partners" | "shared">("partners");

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([listPartners(sb), listSharedWithMe(sb)]);
      setLinks(l);
      setShared(s);
      setError("");
    } catch (e) {
      setError(partnerErrorText(e));
    }
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, fn: () => Promise<void>, done?: string) {
    setBusyId(id);
    setActionError("");
    setNotice(null);
    try {
      await fn();
      announceBuddyChange();
      await load();
      if (done) setNotice(done);
    } catch (e) {
      setActionError(partnerErrorText(e));
    } finally {
      setBusyId(null);
    }
  }

  const hero = <PageHero eyebrow="Peer coaching" title="Partners"
    subtitle="Link with a player you trust. Share the sessions you choose; they can watch the video and leave notes at moments in it." />;
  if (error) return <>{hero}<Notice tone="warn">{error}</Notice></>;
  if (!links) return <>{hero}<p className="text-sm" style={{ color: WHITE_DIM }}>Loading…</p></>;

  const received = links.filter((l) => l.status === "pending" && l.direction === "received");
  const codes = links.filter((l) => l.status === "pending" && l.direction === "sent" && !l.other_id);
  const waiting = links.filter((l) => l.status === "pending" && l.direction === "sent" && l.other_id);
  const partners = links.filter((l) => l.status === "active");

  return <>
    {hero}
    <Sheet className="space-y-6">
      {actionError && <Notice tone="error">{actionError}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <SegmentedTabs label="Partners" idBase="partners" value={tab} onChange={setTab} tabs={[
        { value: "partners", label: "Your partners", badge: received.length ? `${received.length} new` : undefined },
        { value: "shared", label: "Shared with you", badge: shared.length ? String(shared.length) : undefined },
      ]} />

      {tab === "partners" && <div {...tabPanelProps("partners", "partners")} className="space-y-6 outline-none">
        {received.length > 0 && <section aria-labelledby="invites-heading" className="space-y-3">
          <SectionTitle><span id="invites-heading">Wants to be your partner ({received.length})</span></SectionTitle>
          <ul className="space-y-3">{received.map((l) => <li key={l.id}><Card>
            <div className="flex items-center gap-3">
              <PartnerAvatar name={l.other_name ?? "?"} />
              <div className="min-w-0">
                <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
                <p className="text-sm" style={{ color: WHITE_DIM }}>{levelLine(l)}</p>
              </div>
            </div>
            <p className="mt-2 text-sm" style={{ color: INK }}>
              Partners see only the sessions you choose to share, and can leave notes on them. You can unlink at any time.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton disabled={busyId === l.id} onClick={() => void act(l.id, () => respondToInvite(sb, l.id, true), `You and ${l.other_name} are now partners.`)}>
                <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
              <PrimaryButton tone="light" disabled={busyId === l.id} onClick={() => void act(l.id, () => respondToInvite(sb, l.id, false))}>
                <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
            </div>
          </Card></li>)}</ul>
        </section>}

        <section aria-labelledby="partners-heading" className="space-y-3">
          <SectionTitle><span id="partners-heading">Your partners</span></SectionTitle>
          {partners.length === 0 ? <Card><p className="text-sm" style={{ color: WHITE_DIM }}>
            No partners yet. Create a code below and send it, or invite a buddy from Buddy after a session together.</p></Card>
          : <ul className="space-y-3">{partners.map((l) => <li key={l.id}><Card>
              <div className="flex flex-wrap items-center gap-3">
                <PartnerAvatar name={l.other_name ?? "?"} />
                <div className="min-w-[9rem] flex-1">
                  <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
                  <p className="text-sm" style={{ color: WHITE_DIM }}>{levelLine(l)}{l.linked_at ? ` · partners since ${shortDate(l.linked_at)}` : ""}</p>
                </div>
                {unlinking !== l.id && <PrimaryButton tone="light" onClick={() => setUnlinking(l.id)}>Unlink</PrimaryButton>}
              </div>
              {unlinking === l.id && <div className="mt-3 space-y-3 rounded-[var(--radius-md)] p-4" style={{ border: `1px solid ${BORDER}` }}
                role="group" aria-label={`Unlink ${l.other_name}`}>
                <p className="text-sm" style={{ color: INK }}>Unlink {l.other_name}? Sessions you shared with each other are hidden from both
                  of you right away. Notes already left on your sessions stay with you.</p>
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton disabled={busyId === l.id} onClick={() => void act(l.id, async () => { await unlinkPartner(sb, l.id); setUnlinking(null); },
                    `You unlinked ${l.other_name}.`)}>{busyId === l.id ? "Unlinking…" : "Unlink"}</PrimaryButton>
                  <PrimaryButton tone="light" onClick={() => setUnlinking(null)}>Keep partner</PrimaryButton>
                </div>
              </div>}
            </Card></li>)}</ul>}
          {partners.length > 0 && <p className="text-sm" style={{ color: WHITE_DIM }}>
            To share a session, open it from Sessions and use <strong>Share with a partner</strong> under its video report.</p>}
        </section>

        {waiting.length > 0 && <section aria-labelledby="waiting-heading" className="space-y-3">
          <SectionTitle><span id="waiting-heading">Invites you sent</span></SectionTitle>
          <ul className="space-y-3">{waiting.map((l) => <li key={l.id}><Card>
            <div className="flex flex-wrap items-center gap-3">
              <PartnerAvatar name={l.other_name ?? "?"} />
              <div className="min-w-[9rem] flex-1">
                <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
                <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>Waiting for an answer</p>
              </div>
              <PrimaryButton tone="light" disabled={busyId === l.id} onClick={() => void act(l.id, () => cancelInvite(sb, l.id))}>Cancel invite</PrimaryButton>
            </div>
          </Card></li>)}</ul>
        </section>}

        <AddPartnerCard codes={codes} busyId={busyId}
          onCreate={() => act("create", async () => { await createInviteCode(sb); })}
          onCancel={(id) => void act(id, () => cancelInvite(sb, id))}
          onRedeem={async (code) => {
            await redeemCode(sb, code);
            announceBuddyChange();
            await load();
            setNotice("Linked. You are now partners.");
          }} />
      </div>}

      {tab === "shared" && <div {...tabPanelProps("partners", "shared")} className="space-y-3 outline-none">
        {shared.length === 0 ? <Card><p className="text-sm" style={{ color: WHITE_DIM }}>
          Nothing shared with you yet. When a partner shares a session, it shows here and you can leave notes on its video.</p></Card>
        : <ul className="space-y-3" aria-label="Sessions shared with you">{shared.map((s) => <li key={s.session_id}>
            <a href={`#/shared/${s.session_id}`} className="block rounded-[var(--radius-lg)] focus:outline-none focus-visible:ring-2"
              aria-label={`${s.owner_name}: ${s.title}`}><Card>
              <div className="flex items-center gap-3">
                <PartnerAvatar name={s.owner_name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>{s.owner_name}</p>
                  <p className="text-base font-bold truncate" style={{ color: INK }}>{s.title}</p>
                  <p className="text-sm" style={{ color: WHITE_DIM }}>
                    {shortDate(s.session_date)} · {CONTEXT_LABELS[s.session_context]} · {FORMAT_LABELS[s.play_format]}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: s.has_report ? GREEN : ROSE }}>
                    {s.has_report ? <><MessageSquareText size={14} aria-hidden="true" />
                      {s.my_notes ? `${s.my_notes} note${s.my_notes === 1 ? "" : "s"} from you` : "Watch and leave notes"}</>
                      : "No video report yet"}</p>
                </div>
                <ChevronRight size={20} aria-hidden="true" style={{ color: WHITE_DIM }} />
              </div>
            </Card></a></li>)}</ul>}
      </div>}
    </Sheet>
  </>;
}
