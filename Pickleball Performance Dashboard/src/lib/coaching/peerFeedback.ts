import { SELF_SKILLS, SKILL_INFO, type SelfRatings, type SelfSkill } from "./selfAssessment";

export const MAX_FOCUS_SKILLS = 3;

/** One partner's rating of one skill on one session. */
export type PeerRating = { author_id: string; author_name: string; mine?: boolean; skill: SelfSkill; rating: number; updated_at: string };

export type PeerComparison = {
  skill: SelfSkill;
  label: string;
  self: number | null;
  peer: number;
  /** peer − self, or null when the player did not rate the skill. */
  diff: number | null;
  line: string;
  tone: "agree" | "lower" | "higher" | "none";
};

/** "How reliable and deep were your serves?" → "How reliable and deep were Sam's serves?" */
export function aboutPlayer(question: string, name: string): string {
  return question
    .replace(/\byour\b/g, `${name}'s`).replace(/\bYour\b/g, `${name}'s`)
    .replace(/\bdid you\b/g, `did ${name}`).replace(/\bdo you\b/g, `does ${name}`)
    .replace(/\byou were\b/g, `${name} was`).replace(/\bwere you\b/g, `was ${name}`)
    .replace(/\byou\b/g, name).replace(/\bYou\b/g, name);
}

/** Skills to offer when asking for feedback: the player's goal skills first, then the usual order. */
export function askSkillOrder(goalSkills: readonly SelfSkill[]): SelfSkill[] {
  return [...goalSkills.filter((s) => SELF_SKILLS.includes(s)), ...SELF_SKILLS.filter((s) => !goalSkills.includes(s))];
}

/** Self vs one partner, skill by skill, in the order the owner asked. */
export function comparePeer(self: SelfRatings | null | undefined, peer: readonly PeerRating[], author: string): PeerComparison[] {
  return peer.filter((r) => r.author_name === author || r.author_id === author).map((r) => {
    const mine = self?.[r.skill] ?? null;
    const diff = mine == null ? null : r.rating - mine;
    const name = r.author_name;
    const gap = diff == null ? 0 : Math.abs(diff);
    const tone: PeerComparison["tone"] = diff == null ? "none" : diff === 0 ? "agree" : diff < 0 ? "lower" : "higher";
    const line = diff == null ? `You did not rate this skill for this session`
      : diff === 0 ? "You agree"
      : `${name} rated this ${gap} ${diff < 0 ? "lower" : "higher"} than you`;
    return { skill: r.skill, label: SKILL_INFO[r.skill].label, self: mine, peer: r.rating, diff, line, tone };
  });
}

/** Partners' names, each once, in the order their ratings arrive. */
export function peerAuthors(peer: readonly PeerRating[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const r of peer) if (!seen.has(r.author_id)) seen.set(r.author_id, r.author_name);
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** Skills a partner rated at least 1 lower than the player did: these become the plan's first focus. */
export function peerLowerSkills(self: SelfRatings | null | undefined, peer: readonly PeerRating[]): { skill: SelfSkill; by: string; peer: number; self: number }[] {
  const out: { skill: SelfSkill; by: string; peer: number; self: number }[] = [];
  for (const r of peer) {
    const mine = self?.[r.skill];
    if (mine == null || mine - r.rating < 1) continue;
    const existing = out.find((o) => o.skill === r.skill);
    // With two partners, keep the bigger gap.
    if (!existing) out.push({ skill: r.skill, by: r.author_name, peer: r.rating, self: mine });
    else if (r.rating < existing.peer) Object.assign(existing, { by: r.author_name, peer: r.rating });
  }
  return out.sort((a, b) => (b.self - b.peer) - (a.self - a.peer) || SELF_SKILLS.indexOf(a.skill) - SELF_SKILLS.indexOf(b.skill));
}

/** The most recent peer rating of each skill, for the "peer" column on Progress. */
export function latestPeerBySkill(rows: readonly { skill: string; rating: number; updated_at: string }[]): Partial<Record<SelfSkill, number>> {
  const out: Partial<Record<SelfSkill, number>> = {};
  const when: Partial<Record<SelfSkill, string>> = {};
  for (const r of rows) {
    const skill = r.skill as SelfSkill;
    if (!SELF_SKILLS.includes(skill)) continue;
    if (!when[skill] || r.updated_at > when[skill]!) { out[skill] = r.rating; when[skill] = r.updated_at; }
  }
  return out;
}
