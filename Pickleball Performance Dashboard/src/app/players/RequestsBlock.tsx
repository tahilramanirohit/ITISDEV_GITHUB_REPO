import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Trash2, X } from "lucide-react";
import { cancelBuddyAdd, cancelRequest, hideCancelledSession, respondBuddy, respondToRequest } from "../../lib/api/buddy";
import { cancelInvite, respondToInvite } from "../../lib/api/partners";
import { ACTION_SOFT, INK, ROSE, WHITE_DIM } from "../theme";
import { Card, PrimaryButton, SectionTitle } from "../shell/primitives";
import { Avatar, RequestDetails, levelText, shortDate } from "./parts";
import type { Act, PlayersData } from "./PlayersPage";

/** Buddy requests, requests to play and video-partner invites waiting for your answer. */
export function NeedsAnswer({ sb, data, act, busyId }: { sb: SupabaseClient; data: PlayersData; act: Act; busyId: string | null }) {
  const adds = (data.buddies ?? []).filter((b) => b.status === "pending" && b.direction === "received");
  const incoming = data.requests.filter((r) => r.direction === "incoming" && r.status === "pending");
  const invites = data.links.filter((l) => l.status === "pending" && l.direction === "received");
  if (adds.length + incoming.length + invites.length === 0) return null;
  return <>
    {adds.length > 0 && <section aria-labelledby="adds-heading" className="space-y-3">
      <SectionTitle><span id="adds-heading">Wants to be your buddy ({adds.length})</span></SectionTitle>
      <ul className="space-y-3">
        {adds.map((b) => <li key={b.id}><div className="rounded-[20px] p-4"
          style={{ background: ACTION_SOFT, border: "1px solid color-mix(in srgb, var(--pp-action) 35%, var(--pp-line))", color: INK }}>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={b.other_name} id={b.other_id} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{b.other_name}</p>
              <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(b.other_level)}</p>
            </div>
          </div>
          <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>Buddies can ask each other to play and partner for video feedback.
            Nothing else is shared.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PrimaryButton tone="light" disabled={busyId === b.id} onClick={() => void act(b.id, () => respondBuddy(sb, b.id, false))}>
              <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
            <PrimaryButton disabled={busyId === b.id} onClick={() => void act(b.id, () => respondBuddy(sb, b.id, true), `You and ${b.other_name} are buddies.`)}>
              <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
          </div>
        </div></li>)}
      </ul>
    </section>}

    {incoming.length > 0 && <section aria-labelledby="incoming-heading" className="space-y-3">
      <SectionTitle><span id="incoming-heading">Wants to play with you ({incoming.length})</span></SectionTitle>
      <ul className="space-y-3">
        {incoming.map((r) => <li key={r.id}><Card>
          <div className="flex items-center gap-3">
            <Avatar name={r.other_name} id={r.other_player_id} />
            <div className="min-w-0">
              <p className="text-base font-bold" style={{ color: INK }}>{r.other_name}</p>
              <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(r.other_level)}</p>
            </div>
          </div>
          <RequestDetails r={r} />

          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton disabled={busyId === r.id} onClick={() => void act(r.id, () => respondToRequest(sb, r.id, true),
              `You're playing with ${r.other_name}. It's under My partners.`)}>
              <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
            <PrimaryButton tone="light" disabled={busyId === r.id} onClick={() => void act(r.id, () => respondToRequest(sb, r.id, false))}>
              <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
          </div>
        </Card></li>)}
      </ul>
    </section>}

    {invites.length > 0 && <section aria-labelledby="invites-heading" className="space-y-3">
      <SectionTitle><span id="invites-heading">Wants to be your video partner ({invites.length})</span></SectionTitle>
      <ul className="space-y-3">{invites.map((l) => <li key={l.id}><Card>
        <div className="flex items-center gap-3">
          <Avatar name={l.other_name ?? "?"} id={l.other_id} />
          <div className="min-w-0">
            <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
            <p className="text-sm" style={{ color: WHITE_DIM }}>{levelText(l.other_level)}</p>
          </div>
        </div>
        <p className="mt-2 text-sm" style={{ color: INK }}>
          Video partners see only the sessions you choose to share, and only what you ask them about. You can unlink at any time.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={busyId === l.id} onClick={() => void act(l.id, () => respondToInvite(sb, l.id, true), `You and ${l.other_name} are now video partners.`)}>
            <Check size={18} aria-hidden="true" /> Accept</PrimaryButton>
          <PrimaryButton tone="light" disabled={busyId === l.id} onClick={() => void act(l.id, () => respondToInvite(sb, l.id, false))}>
            <X size={18} aria-hidden="true" /> Decline</PrimaryButton>
        </div>
      </Card></li>)}</ul>
    </section>}
  </>;
}

/** Requests and invites you sent, and buddy sessions that were cancelled. */
export function SentAndCancelled({ sb, data, act, busyId }: { sb: SupabaseClient; data: PlayersData; act: Act; busyId: string | null }) {
  const sentAdds = (data.buddies ?? []).filter((b) => b.status === "pending" && b.direction === "sent");
  const sent = data.requests.filter((r) => r.direction === "outgoing" && (r.status === "pending" || r.status === "declined"));
  const waiting = data.links.filter((l) => l.status === "pending" && l.direction === "sent" && l.other_id);
  const calledOff = data.requests.filter((r) => r.status === "called_off");
  return <>
    {sentAdds.length + sent.length + waiting.length > 0 && <section aria-labelledby="sent-heading" className="space-y-3">
      <SectionTitle><span id="sent-heading">Waiting for others</span></SectionTitle>
      <ul className="space-y-3">
        {sentAdds.map((b) => <li key={b.id}><Card>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={b.other_name} id={b.other_id} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{b.other_name}</p>
              <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>Buddy request · waiting for an answer</p>
            </div>
            <PrimaryButton tone="light" disabled={busyId === b.id} onClick={() => void act(b.id, () => cancelBuddyAdd(sb, b.id))}>Cancel request</PrimaryButton>
          </div>
        </Card></li>)}
        {sent.map((r) => <li key={r.id}><Card>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={r.other_name} id={r.other_player_id} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{r.other_name}</p>
              <p className="text-sm font-bold" style={{ color: r.status === "declined" ? ROSE : WHITE_DIM }}>
                {r.status === "pending" ? "Asked to play · waiting for an answer" : "Asked to play · declined"}</p>
            </div>
            {r.status === "pending" && <PrimaryButton tone="light" disabled={busyId === r.id}
              onClick={() => void act(r.id, () => cancelRequest(sb, r.id))}>Cancel request</PrimaryButton>}
          </div>
          <RequestDetails r={r} />
        </Card></li>)}
        {waiting.map((l) => <li key={l.id}><Card>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={l.other_name ?? "?"} id={l.other_id} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{l.other_name}</p>
              <p className="text-sm font-bold" style={{ color: WHITE_DIM }}>Video partner invite · waiting for an answer</p>
            </div>
            <PrimaryButton tone="light" disabled={busyId === l.id} onClick={() => void act(l.id, () => cancelInvite(sb, l.id))}>Cancel invite</PrimaryButton>
          </div>
        </Card></li>)}
      </ul>
    </section>}

    {calledOff.length > 0 && <section aria-labelledby="called-off-heading" className="space-y-3">
      <SectionTitle><span id="called-off-heading">Cancelled sessions</span></SectionTitle>
      <ul className="space-y-3">
        {calledOff.map((r) => <li key={r.id}><Card>
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={r.other_name} id={r.other_player_id} />
            <div className="min-w-[9rem] flex-1">
              <p className="text-base font-bold" style={{ color: INK }}>{r.other_name}</p>
              <p className="text-sm font-bold" style={{ color: ROSE }}>
                {r.cancelled_by_me ? "You cancelled" : `${r.other_name} cancelled`}{r.cancelled_at ? ` · ${shortDate(r.cancelled_at)}` : ""}</p>
            </div>
            <PrimaryButton tone="light" disabled={busyId === `hide-${r.id}`} aria-label={`Remove the cancelled session with ${r.other_name}`}
              onClick={() => void act(`hide-${r.id}`, () => hideCancelledSession(sb, r.id), "Removed from your list.")}>
              <Trash2 size={16} aria-hidden="true" /> Remove</PrimaryButton>
          </div>
          <p className="mt-2 text-sm" style={{ color: INK }}>
            {r.cancel_reason ? <><strong>Reason:</strong> {r.cancel_reason}</> : <span style={{ color: WHITE_DIM }}>No reason given</span>}</p>
          <RequestDetails r={r} />
        </Card></li>)}
      </ul>
    </section>}
  </>;
}
