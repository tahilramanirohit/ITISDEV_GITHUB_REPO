// "My people" on the Players tab: buddies and partners on one list, one entry per person.
// Built from data the app already reads (buddy requests, partner links, the player's own
// sessions and shares), so it needs no database change.
import { upcomingBuddySessions, type BuddyLevel, type BuddyLink, type BuddyRequest, type FreeTime } from "../api/buddy";
import type { PartnerLink, SharedSession } from "../api/partners";

/** The player's own sessions, as far as the people list needs them. */
export type MySessionLite = { id: string; title: string; session_date: string; created_at?: string; buddy_request_id?: string | null };
/** One of the player's sessions shared with a partner (what was asked is missing before the peer-feedback update). */
export type MyShare = { session_id: string; partner_id: string; focus_skills?: string[] | null; with_video?: boolean | null };
/** Who rated which of the player's sessions (peer ratings, owner's view). */
export type PeerRatingRef = { session_id: string; author_id: string };

export type Person = {
  id: string;
  name: string;
  level: BuddyLevel | null;
  /** The buddy link (friend list), when buddies; null before the buddy-friends update. */
  buddy: BuddyLink | null;
  /** The partnership, when it is active. */
  partner: PartnerLink | null;
  /** A partner invite between you that is waiting for an answer. */
  invite: PartnerLink | null;
  /** Accepted buddy sessions with this person. */
  buddySessions: BuddyRequest[];
  /** The next agreed time with this person, if one is still ahead. */
  next: FreeTime | null;
  /** Sessions you logged from a buddy session with this person. */
  gamesTogether: number;
  /** YYYY-MM-DD of the latest of those sessions. */
  lastPlayed: string | null;
  /** Your sessions shared with them (feedback you asked for). */
  askedThem: number;
  /** Their sessions shared with you. */
  theyShared: SharedSession[];
  /** Of those, the ones still waiting for your feedback. */
  waitingOnYou: SharedSession[];
};

/** A shared session still waiting for the partner's feedback: asked skills not all rated, or a video with no note yet. */
export function feedbackDue(s: SharedSession): boolean {
  if (s.focus_skills?.length) return (s.my_ratings ?? 0) < s.focus_skills.length;
  return s.has_report && s.my_notes === 0;
}

export function buildPeople({ buddies = null, requests, links, sessions, shares, sharedWithMe, today = new Date() }: {
  /** Your buddy list; null before the buddy-friends update (then an accepted buddy session counts as buddies). */
  buddies?: readonly BuddyLink[] | null;
  requests: readonly BuddyRequest[]; links: readonly PartnerLink[]; sessions: readonly MySessionLite[];
  shares: readonly MyShare[]; sharedWithMe: readonly SharedSession[]; today?: Date;
}): Person[] {
  const people = new Map<string, Person>();
  const get = (id: string, name: string | null, level: BuddyLevel | null) => {
    let p = people.get(id);
    if (!p) {
      p = { id, name: name || "Player", level, buddy: null, partner: null, invite: null, buddySessions: [], next: null, gamesTogether: 0,
        lastPlayed: null, askedThem: 0, theyShared: [], waitingOnYou: [] };
      people.set(id, p);
    }
    if (!p.level && level) p.level = level;
    return p;
  };

  for (const b of buddies ?? []) if (b.status === "active") get(b.other_id, b.other_name, b.other_level).buddy = b;
  for (const r of requests) {
    if (r.status !== "accepted") continue;
    // With a buddy list, sessions stay with people who are still buddies (or partners, added below).
    if (buddies && !people.has(r.other_player_id) && !links.some((l) => l.other_id === r.other_player_id && l.status === "active")) continue;
    get(r.other_player_id, r.other_name, r.other_level).buddySessions.push(r);
  }
  for (const l of links) {
    if (!l.other_id) continue; // an unused invite code
    if (l.status === "active") get(l.other_id, l.other_name, l.other_level).partner = l;
    else if (people.has(l.other_id)) people.get(l.other_id)!.invite = l;
  }

  // Games together: sessions logged from any buddy session with them (also one called off later).
  const requestOwner = new Map(requests.map((r) => [r.id, r.other_player_id]));
  for (const s of sessions) {
    const who = s.buddy_request_id ? requestOwner.get(s.buddy_request_id) : undefined;
    const p = who ? people.get(who) : undefined;
    if (!p) continue;
    p.gamesTogether += 1;
    if (!p.lastPlayed || s.session_date > p.lastPlayed) p.lastPlayed = s.session_date;
  }
  for (const s of shares) { const p = people.get(s.partner_id); if (p) p.askedThem += 1; }
  for (const s of sharedWithMe) {
    const p = people.get(s.owner_id);
    if (!p) continue;
    p.theyShared.push(s);
    if (feedbackDue(s)) p.waitingOnYou.push(s);
  }
  for (const p of people.values()) p.next = upcomingBuddySessions(p.buddySessions, today)[0]?.when ?? null;

  // Someone waiting on you first, then the next game, then who you played with last.
  return [...people.values()].sort((a, b) =>
    b.waitingOnYou.length - a.waitingOnYou.length
    || (a.next ? 0 : 1) - (b.next ? 0 : 1)
    || (a.next && b.next ? `${a.next.date}${a.next.start}`.localeCompare(`${b.next.date}${b.next.start}`) : 0)
    || (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? "")
    || a.name.localeCompare(b.name));
}

/** The newest sessions first, for "Ask for feedback on…". */
export function recentSessions(sessions: readonly MySessionLite[], limit = 5): MySessionLite[] {
  return [...sessions].sort((a, b) => b.session_date.localeCompare(a.session_date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, limit);
}
