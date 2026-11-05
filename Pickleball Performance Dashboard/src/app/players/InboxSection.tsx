import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronRight, MessageSquareText, X } from "lucide-react";
import { cancelRequest, respondToRequest } from "../../lib/api/buddy";
import { cancelInvite, respondToInvite, type SharedSession } from "../../lib/api/partners";
import { CONTEXT_LABELS, FORMAT_LABELS } from "../../lib/api/types";
import { feedbackDue } from "../../lib/coaching/people";
import { SKILL_INFO } from "../../lib/coaching/selfAssessment";
import { GREEN, INK, ROSE, WHITE_DIM } from "../theme";
import { Card, PrimaryButton, SectionTitle } from "../shell/primitives";
import { Avatar, RequestDetails, levelText, shortDate } from "./parts";
import type { Act, PlayersData, Section } from "./PlayersPage";

/** A session a partner shared with you, linking to their report. */
export function SharedCard({ s }: { s: SharedSession }) {
  const due = feedbackDue(s);
  return <a href={`#/shared/${s.session_id}`} className="block rounded-[var(--radius-lg)] focus:outline-none focus-visible:ring-2"
    aria-label={`${s.owner_name}: ${s.title}`}><Card>
    <div className="flex items-center gap-3">
      <Avatar name={s.owner_name} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>{s.owner_name}</p>
        <p className="truncate text-base font-bold" style={{ color: INK }}>{s.title}</p>
        <p className="text-sm" style={{ color: WHITE_DIM }}>
          {shortDate(s.session_date)} · {CONTEXT_LABELS[s.session_context]} · {FORMAT_LABELS[s.play_format]}</p>
        {s.focus_skills?.length ? <p className="mt-1 text-sm" style={{ color: INK }}>
          Asked: <b>{s.focus_skills.map((k) => SKILL_INFO[k].label).join(", ")}</b>{s.with_video === false ? " · ratings only" : ""}</p> : null}
        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold" style={{ color: due || s.has_report || s.focus_skills?.length ? GREEN : ROSE }}>
          {s.focus_skills?.length
            ? due ? "Rate and send feedback" : "✓ Feedback sent"
            : s.has_report ? <><MessageSquareText size={14} aria-hidden="true" />
              {s.my_notes ? `${s.my_notes} note${s.my_notes === 1 ? "" : "s"} from you` : "Watch and leave notes"}</>
            : "No video report yet"}</p>
      </div>
      <ChevronRight size={20} aria-hidden="true" style={{ color: WHITE_DIM }} />
    </div>
  </Card></a>;
}

/** Everything waiting for an answer: buddy requests, partner invites and feedback partners asked of you. */
export function InboxSection({ sb, data, act, busyId, onOpen }: {
  sb: SupabaseClient; data: PlayersData; act: Act; busyId: string | null; onOpen: (s: Section) => void;
}) {
  const { requests, links, shared } = data;
  const incoming = requests.filter((r) => r.direction === "incoming" && r.status === "pending");
  const invites = links.filter((l) => l.status === "pending" && l.direction === "received");
  const due = shared.filter(feedbackDue);
  const done = shared.filter((s) => !feedbackDue(s));
  const sent = requests.filter((r) => r.direction === "outgoing" && (r.status === "pending" || r.status === "declined"));
  const waiting = links.filter((l) => l.status === "pending" && l.direction === "sent" && l.other_id);
  const calledOff = requests.filter((r) => r.status === "called_off");
  const empty = incoming.length + invites.length + shared.length + sent.length + waiting.length + calledOff.length === 0;

  return <>
    {incoming.length > 0 && <section aria-labelledby="incoming-heading" className="space-y-3">
      <SectionTitle><span id="incoming-heading">Wants to play with you ({incoming.length})</span></SectionTitle>
      <ul className="space-y-3">
        {incoming.map((r) => <li key={r.id}><Card>
          <div className="flex items-center gap-3">
            <Avatar name={r.other_name} />
            <div className="min-w-0">
              <p className="text-base font-bold" style={{ color: INK }}>{r.other_name}</p>
              <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(r.other_level)}</p>
            </div>
          </div>
          <RequestDetails r={r} />
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton disabled={busyId === r.id} onClick={() => void act(r.id, () => respondToRequest(sb, r.id, true),
              `You and ${r.other_name} are buddies. Find them under My people.`)}>
              <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
            <PrimaryButton tone="light" disabled={busyId === r.id} onClick={() => void act(r.id, () => respondToRequest(sb, r.id, false))}>
              <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
          </div>
        </Card></li>)}
      </ul>
    </section>}

    {invites.length > 0 && <section aria-labelledby="invites-heading" className="space-y-3">
      <SectionTitle><span id="invites-heading">Wants to be your partner ({invites.length})</span></SectionTitle>
      <ul className="space-y-3">{invites.map((l) => <li key={l.id}><Card>
        <div className="flex items-center gap-3">
          <Avatar name={l.other_name ?? "?"} />
          <div className="min-w-0">
            <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
            <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(l.other_level)}</p>
          </div>
        </div>
        <p className="mt-2 text-sm" style={{ color: INK }}>
          Partners see only the sessions you choose to share, and only what you ask them about. You can unlink at any time.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={busyId === l.id} onClick={() => void act(l.id, () => respondToInvite(sb, l.id, true), `You and ${l.other_name} are now partners.`)}>
            <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
          <PrimaryButton tone="light" disabled={busyId === l.id} onClick={() => void act(l.id, () => respondToInvite(sb, l.id, false))}>
            <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
        </div>
      </Card></li>)}</ul>
    </section>}

    {due.length > 0 && <section aria-labelledby="due-heading" className="space-y-3">
      <SectionTitle><span id="due-heading">Feedback asked of you ({due.length})</span></SectionTitle>
      <ul className="space-y-3" aria-label="Feedback asked of you">{due.map((s) => <li key={s.session_id}><SharedCard s={s} /></li>)}</ul>
    </section>}

    {sent.length + waiting.length > 0 && <section aria-labelledby="sent-heading" className="space-y-3">
      <SectionTitle><span id="sent-heading">Waiting for others</span></SectionTitle>
      <ul className="space-y-3">
        {sent.map((r) => <li key={r.id}><Card>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={r.other_name} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{r.other_name}</p>
              <p className="text-sm font-bold" style={{ color: r.status === "declined" ? ROSE : WHITE_DIM }}>
                {r.status === "pending" ? "Buddy request · waiting for an answer" : "Buddy request · declined"}</p>
            </div>
            {r.status === "pending" && <PrimaryButton tone="light" disabled={busyId === r.id}
              onClick={() => void act(r.id, () => cancelRequest(sb, r.id))}>Cancel request</PrimaryButton>}
          </div>
          <RequestDetails r={r} />
        </Card></li>)}
        {waiting.map((l) => <li key={l.id}><Card>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={l.other_name ?? "?"} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
              <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>Partner invite · waiting for an answer</p>
            </div>
            <PrimaryButton tone="light" disabled={busyId === l.id} onClick={() => void act(l.id, () => cancelInvite(sb, l.id))}>Cancel invite</PrimaryButton>
          </div>
        </Card></li>)}
      </ul>
    </section>}

    {done.length > 0 && <section aria-labelledby="shared-heading" className="space-y-3">
      <SectionTitle><span id="shared-heading">Shared with you</span></SectionTitle>
      <ul className="space-y-3" aria-label="Sessions shared with you">{done.map((s) => <li key={s.session_id}><SharedCard s={s} /></li>)}</ul>
    </section>}

    {calledOff.length > 0 && <section aria-labelledby="called-off-heading" className="space-y-3">
      <SectionTitle><span id="called-off-heading">Cancelled sessions</span></SectionTitle>
      <ul className="space-y-3">
        {calledOff.map((r) => <li key={r.id}><Card>
          <div className="flex items-center gap-3">
            <Avatar name={r.other_name} />
            <div className="min-w-0">
              <p className="text-base font-bold" style={{ color: INK }}>{r.other_name}</p>
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

    {empty && <Card><p className="text-sm" style={{ color: WHITE_DIM }}>
      Nothing waiting. Buddy requests, partner invites and sessions partners ask you to look at show up here.{" "}
      <button type="button" className="font-bold underline" style={{ color: GREEN }} onClick={() => onOpen("find")}>Find players</button></p></Card>}
  </>;
}
