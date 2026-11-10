import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, UserRoundPlus } from "lucide-react";
import {
  BUDDY_LEVELS, LEVEL_LABELS, LOOKING_FOR, addBuddy, buddyLevel, respondBuddy, sendBuddyRequest, setBuddyVisible, setLookingFor, sortByLevel,
  type BuddyLevel, type BuddyPurpose,
} from "../../lib/api/buddy";
import { goalTargets } from "../../lib/coaching/goals";
import { suggestBuddies } from "../../lib/coaching/buddyMatch";
import { ACCENT_INK, GREEN, GREEN_BG, INK, WHITE_DIM } from "../theme";
import { Card, Chip, Notice, PrimaryButton, SectionTitle } from "../shell/primitives";
import { announceBuddyChange } from "../buddy/useBuddyBadge";
import { Avatar, LookingFor, RequestForm, SHORT_PURPOSE, levelText } from "./parts";
import type { Act, PlayersData } from "./PlayersPage";

/** The Buddy list: your own listing, suggested players and everyone listed, with "Buddy up". */
export function FindSection({ sb, userId, data, injured, act, busyId, reload }: {
  sb: SupabaseClient; userId: string; data: PlayersData; injured: boolean; act: Act; busyId: string | null; reload: () => Promise<void>;
}) {
  const { profile, players, details } = data;
  const [listing, setListing] = useState(data.listing);
  useEffect(() => setListing(data.listing), [data.listing]);
  const [filter, setFilter] = useState<BuddyLevel | "all">("all");
  const [purpose, setPurpose] = useState<BuddyPurpose | "all">("all");
  const [asking, setAsking] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const myLevel = buddyLevel(profile.self_level);
  const visible = !!profile.buddy_visible;
  const shown = useMemo(() => sortByLevel(players.filter((p) => (filter === "all" || p.level === filter)
    && (purpose === "all" || details.get(p.player_id)?.looking_for.includes(purpose))), myLevel), [players, filter, purpose, details, myLevel]);
  const focusSkills = useMemo(() => goalTargets(profile.baseline_ratings, profile.main_goals ?? []).map((g) => g.skill), [profile]);
  // With the buddy list (upgrade 12), you add players as buddies here; asking to play happens from My partners.
  const friends = data.buddies;
  const linkWith = (id: string) => friends?.find((b) => b.other_id === id);
  const suggestions = useMemo(() => listing ? suggestBuddies(players.filter((p) => !friends?.some((b) => b.other_id === p.player_id)), details, {
    gameRating: listing.game_rating, lookingFor: listing.looking_for, focusSkills, level: myLevel,
  }) : [], [players, friends, details, listing, focusSkills, myLevel]);
  const add = (id: string, name: string) => void act(`add-${id}`, () => addBuddy(sb, id),
    `Buddy request sent to ${name}. Once they accept, find them under My partners to ask them to play or partner for video feedback.`);

  function askFromSuggestion(id: string) {
    setFilter("all");
    setPurpose("all");
    setAsking(id);
    setSentTo(null);
    window.setTimeout(() => document.getElementById(`player-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return <>
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold" style={{ color: INK }}>{visible ? "You are listed in Buddy" : "You are hidden from the Buddy list"}</p>
          <p className="text-sm" style={{ color: WHITE_DIM }}>
            {visible ? `Others see: ${[profile.display_name, levelText(myLevel), listing?.game_rating != null ? `game ${listing.game_rating.toFixed(1)}` : null,
              listing?.looking_for.length ? `looking for ${listing.looking_for.map((l) => SHORT_PURPOSE[l].toLowerCase()).join(", ")}` : null]
              .filter(Boolean).join(" · ")}` : injured ? "Hidden while you recover. \"I'm back to playing\" on Home lists you again."
              : "You can still ask others. Turn this on so others can ask you."}
          </p>
        </div>
        <PrimaryButton tone="light" disabled={busyId === "visible"}
          onClick={() => void act("visible", () => setBuddyVisible(sb, userId, !visible))}>{visible ? "Hide me" : "Show me"}</PrimaryButton>
      </div>
      {listing && <div className="mt-4">
        <p className="text-sm font-bold" style={{ color: INK }}>I'm looking for</p>
        <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="I'm looking for">
          {LOOKING_FOR.map((l) => {
            const on = listing.looking_for.includes(l);
            return <Chip key={l} selected={on} onClick={() => {
              const next = on ? listing.looking_for.filter((x) => x !== l) : LOOKING_FOR.filter((x) => x === l || listing.looking_for.includes(x));
              setListing({ ...listing, looking_for: next });
              void act("looking", () => setLookingFor(sb, userId, next));
            }}>{SHORT_PURPOSE[l]}</Chip>;
          })}
        </div>
      </div>}
      {!myLevel && <p className="mt-3 text-sm" style={{ color: INK }}>
        Your level is not set. <a href="#/profile/edit" className="font-bold underline" style={{ color: GREEN }}>Add it in Edit profile</a> so
        players can find a buddy at their level.</p>}
    </Card>

    {listing && (listing.looking_for.length === 0
      ? <p className="rounded-[14px] px-3 py-2.5 text-sm" style={{ background: GREEN_BG, color: INK }}>
          Pick what you're looking for above to see suggested buddies.</p>
      : suggestions.length > 0 && <section aria-labelledby="suggested-heading" className="space-y-2">
          <SectionTitle><span id="suggested-heading">Suggested for you</span></SectionTitle>
          <ul className="space-y-2">
            {suggestions.map((s) => <li key={s.player.player_id}><Card>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={s.player.display_name} id={s.player.player_id} />
                <div className="min-w-[9rem] flex-1">
                  <p className="text-base font-bold" style={{ color: INK }}>{s.player.display_name}</p>
                  <p className="text-sm font-bold" style={{ color: ACCENT_INK }}>{s.reason}</p>
                  <p className="text-xs" style={{ color: WHITE_DIM }}>{levelText(s.player.level)}{s.details.game_rating != null ? ` · game ${s.details.game_rating.toFixed(1)}` : ""}</p>
                  <LookingFor list={s.details.looking_for} />
                </div>
                {friends
                  ? <PrimaryButton disabled={busyId === `add-${s.player.player_id}`} onClick={() => add(s.player.player_id, s.player.display_name)}
                      aria-label={`Add ${s.player.display_name} as a buddy`}><UserRoundPlus size={18} aria-hidden="true" /> Add</PrimaryButton>
                  : <PrimaryButton onClick={() => askFromSuggestion(s.player.player_id)} aria-label={`Ask ${s.player.display_name}`}>Ask</PrimaryButton>}
              </div>
            </Card></li>)}
          </ul>
        </section>)}

    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by level">
      <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All levels</Chip>
      {BUDDY_LEVELS.map((l) => <Chip key={l} selected={filter === l} onClick={() => setFilter(l)}>{LEVEL_LABELS[l]}</Chip>)}
    </div>
    {details.size > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by purpose">
      <Chip selected={purpose === "all"} onClick={() => setPurpose("all")}>All purposes</Chip>
      <Chip selected={purpose === "practice"} onClick={() => setPurpose("practice")}>Practice</Chip>
      <Chip selected={purpose === "competition"} onClick={() => setPurpose("competition")}>Competition prep</Chip>
    </div>}
    {sentTo && <Notice>Request sent to {sentTo}. Follow it under My partners.</Notice>}
    {shown.length === 0 ? <Card><p className="text-sm" style={{ color: WHITE_DIM }}>
        {filter === "all" && purpose === "all" ? "No other players are listed yet. Ask your playing partners to open Players and show themselves."
          : "No listed players match these filters right now."}</p></Card>
      : <ul className="space-y-3" aria-label="Available players">
          {shown.map((p) => {
            const link = linkWith(p.player_id);
            const status = friends
              ? link?.status === "active" ? "Buddies" : link?.direction === "sent" ? "Buddy request sent" : null
              : p.request_status === "accepted" ? "Buddies"
              : p.request_status === "pending" && p.request_direction === "outgoing" ? "Request sent"
              : p.request_status === "pending" ? "Wants to buddy up with you" : null;
            const d = details.get(p.player_id);
            return <li key={p.player_id} id={`player-${p.player_id}`} className="scroll-mt-6"><Card>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={p.display_name} id={p.player_id} />
                <div className="min-w-[9rem] flex-1">
                  <p className="text-base font-bold" style={{ color: INK }}>{p.display_name}</p>
                  <p className="text-sm" style={{ color: WHITE_DIM }}>
                    {levelText(p.level)}{d?.game_rating != null ? ` · game ${d.game_rating.toFixed(1)}` : ""}{p.usual_format ? ` · usually ${p.usual_format === "both" ? "singles and doubles" : p.usual_format}` : ""}
                  </p>
                  <LookingFor list={d?.looking_for ?? []} />
                </div>
                {status
                  ? <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: GREEN_BG, color: INK }}>{status}</span>
                  : friends && link
                    ? <PrimaryButton disabled={busyId === link.id} onClick={() => void act(link.id, () => respondBuddy(sb, link.id, true),
                        `You and ${p.display_name} are buddies.`)}><Check size={18} aria-hidden="true" /> Accept buddy</PrimaryButton>
                  : friends
                    ? <PrimaryButton disabled={busyId === `add-${p.player_id}`} onClick={() => add(p.player_id, p.display_name)}>
                        <UserRoundPlus size={18} aria-hidden="true" /> Add buddy</PrimaryButton>
                  : asking !== p.player_id && <PrimaryButton onClick={() => { setAsking(p.player_id); setSentTo(null); }}>
                      <UserRoundPlus size={18} aria-hidden="true" /> Buddy up</PrimaryButton>}
              </div>
              {asking === p.player_id && <RequestForm player={p} onClose={() => setAsking(null)} onSend={async (purpose, format, slots, meetup) => {
                await sendBuddyRequest(sb, p.player_id, purpose, format, slots, meetup);
                setAsking(null);
                setSentTo(p.display_name);
                announceBuddyChange();
                await reload();
              }} />}
            </Card></li>;
          })}
        </ul>}
  </>;
}
