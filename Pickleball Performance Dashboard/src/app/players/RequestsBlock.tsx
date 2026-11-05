import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, X } from "lucide-react";
import { cancelRequest, respondToRequest } from "../../lib/api/buddy";
import { cancelInvite, respondToInvite } from "../../lib/api/partners";
import { INK, ROSE, WHITE_DIM } from "../theme";
import { Card, PrimaryButton, SectionTitle } from "../shell/primitives";
import { Avatar, RequestDetails, levelText, shortDate } from "./parts";
import type { Act, PlayersData } from "./PlayersPage";

/** Buddy requests and video-partner invites waiting for your answer. */
export function NeedsAnswer({ sb, data, act, busyId }: { sb: SupabaseClient; data: PlayersData; act: Act; busyId: string | null }) {
  const incoming = data.requests.filter((r) => r.direction === "incoming" && r.status === "pending");
  const invites = data.links.filter((l) => l.status === "pending" && l.direction === "received");
  if (incoming.length + invites.length === 0) return null;
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
          <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>Accepting makes you buddies. Later you can partner for video feedback too.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton disabled={busyId === r.id} onClick={() => void act(r.id, () => respondToRequest(sb, r.id, true),
              `You and ${r.other_name} are buddies.`)}>
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
          <Avatar name={l.other_name ?? "?"} />
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
  const sent = data.requests.filter((r) => r.direction === "outgoing" && (r.status === "pending" || r.status === "declined"));
  const waiting = data.links.filter((l) => l.status === "pending" && l.direction === "sent" && l.other_id);
  const calledOff = data.requests.filter((r) => r.status === "called_off");
  return <>
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
  </>;
}
