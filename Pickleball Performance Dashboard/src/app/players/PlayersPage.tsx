import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buddyErrorText, getMyListing, listBuddyDetails, listBuddyPlayers, listMyRequests,
  type BuddyDetails, type BuddyPlayer, type BuddyRequest, type MyListing,
} from "../../lib/api/buddy";
import { listPartners, listSharedWithMe, partnerErrorText, type PartnerLink, type SharedSession } from "../../lib/api/partners";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { buildPeople, feedbackDue, type MySessionLite, type MyShare, type PeerRatingRef } from "../../lib/coaching/people";
import { WHITE_DIM } from "../theme";
import { Notice, PageHero, SegmentedTabs, Sheet, tabPanelProps } from "../shell/primitives";
import { announceBuddyChange } from "../buddy/useBuddyBadge";
import { useInjury } from "../recovery/RecoveryCard";
import { JoinCard } from "./parts";
import { FindSection } from "./FindSection";
import { PeopleSection } from "./PeopleSection";
import { SharedSection } from "./SharedSection";

export type PlayersData = {
  profile: PlayerProfile;
  /** Buddy needs the 18+ confirmation; until then only partners are loaded. */
  buddyReady: boolean;
  players: BuddyPlayer[];
  requests: BuddyRequest[];
  details: Map<string, BuddyDetails>;
  listing: MyListing | null;
  links: PartnerLink[];
  shared: SharedSession[];
  sessions: MySessionLite[];
  shares: MyShare[];
  /** Who rated which of your shared sessions, for "You shared". */
  peerRatings: PeerRatingRef[];
};

export type Act = (id: string, fn: () => Promise<void>, done?: string) => Promise<void>;

export type Section = "partners" | "find" | "shared";
const SECTIONS: Section[] = ["partners", "find", "shared"];
/** Section names used by earlier links. */
const OLD_SECTIONS: Record<string, Section> = { people: "partners", inbox: "partners" };

async function loadSessions(sb: SupabaseClient, userId: string): Promise<{ sessions: MySessionLite[]; shares: MyShare[]; peerRatings: PeerRatingRef[] }> {
  const [s, sh, pr] = await Promise.all([
    sb.from("sessions").select("*").eq("owner_id", userId).order("session_date", { ascending: false }).limit(200),
    // What was asked arrives with the peer-feedback update; before it, only who.
    sb.from("report_shares").select("session_id, partner_id, focus_skills, with_video").eq("owner_id", userId).limit(1000)
      .then((r) => r.error ? sb.from("report_shares").select("session_id, partner_id").eq("owner_id", userId).limit(1000) : r),
    sb.from("peer_ratings").select("session_id, author_id").eq("owner_id", userId).limit(2000),
  ]);
  return { sessions: (s.error ? [] : s.data ?? []) as MySessionLite[], shares: (sh.error ? [] : sh.data ?? []) as MyShare[],
    peerRatings: (pr.error ? [] : pr.data ?? []) as PeerRatingRef[] };
}

/**
 * Players: buddies and video partners in one place. You become buddies first (Find → Buddy up,
 * they accept); a buddy can then become a video partner. My partners lists them with anything
 * waiting for your answer; Find is the Buddy list; Shared holds sessions shared either way,
 * so both players reach the video.
 */
export default function PlayersPage({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const [data, setData] = useState<PlayersData | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const injury = useInjury(sb);

  const load = useCallback(async () => {
    try {
      const profile = await getProfile(sb, userId);
      if (!profile) throw new Error("Your profile could not be loaded. Reload the page.");
      const buddyReady = !!profile.is_adult_confirmed;
      // Partners and the extras are optional: before their database updates, the rest still works.
      const [players, requests, links, shared, details, listing, mine] = await Promise.all([
        buddyReady ? listBuddyPlayers(sb) : Promise.resolve([]),
        buddyReady ? listMyRequests(sb) : Promise.resolve([]),
        listPartners(sb).catch(() => []),
        listSharedWithMe(sb).catch(() => []),
        buddyReady ? listBuddyDetails(sb).catch(() => new Map<string, BuddyDetails>()) : Promise.resolve(new Map<string, BuddyDetails>()),
        buddyReady ? getMyListing(sb).catch(() => null) : Promise.resolve(null),
        loadSessions(sb, userId).catch(() => ({ sessions: [], shares: [], peerRatings: [] })),
      ]);
      setData({ profile, buddyReady, players, requests, details, listing, links, shared, ...mine });
      setError("");
    } catch (e) {
      setError(buddyErrorText(e));
    }
  }, [sb, userId]);
  useEffect(() => { void load(); }, [load]);

  const act: Act = useCallback(async (id, fn, done) => {
    setBusyId(id);
    setActionError("");
    setNotice(null);
    try {
      await fn();
      announceBuddyChange();
      await load();
      if (done) setNotice(done);
    } catch (e) {
      const text = buddyErrorText(e);
      setActionError(/^partners:/.test(e instanceof Error ? e.message : "") ? partnerErrorText(e) : text);
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const people = useMemo(() => data ? buildPeople({ requests: data.requests, links: data.links, sessions: data.sessions,
    shares: data.shares, sharedWithMe: data.shared }) : [], [data]);
  const answerCount = data ? data.requests.filter((r) => r.direction === "incoming" && r.status === "pending").length
    + data.links.filter((l) => l.status === "pending" && l.direction === "received").length : 0;
  const dueCount = data ? data.shared.filter(feedbackDue).length : 0;

  // Without a section in the link, open where there is something to do, then stay there.
  const raw = params.get("section") ?? "";
  const asked = OLD_SECTIONS[raw] ?? raw;
  const [first, setFirst] = useState<Section | null>(null);
  const loaded = data !== null;
  const pick = (): Section => answerCount ? "partners" : dueCount ? "shared" : people.length || !data?.buddyReady ? "partners" : "find";
  useEffect(() => {
    if (loaded && first === null) setFirst(pick());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- decided once, on the first load
  }, [loaded, first]);
  const section: Section = SECTIONS.includes(asked as Section) ? asked as Section : first ?? pick();
  const open = (next: Section) => {
    setNotice(null);
    setActionError("");
    setParams((p) => { const n = new URLSearchParams(p); n.set("section", next); return n; }, { replace: true });
  };

  const hero = <PageHero eyebrow="Play together, coach each other" title="Players"
    subtitle="Buddy up to play. Partner with a buddy for video feedback on your game." />;
  if (error) return <>{hero}<Notice tone="warn">{error}</Notice></>;
  if (!data) return <>{hero}<p className="text-sm" style={{ color: WHITE_DIM }}>Loading…</p></>;

  const join = <JoinCard onJoin={async (listed) => {
    const { error: e } = await sb.from("profiles").update({ is_adult_confirmed: true, ...(listed ? { buddy_visible: true } : {}) }).eq("id", userId);
    if (e) throw new Error(e.message);
    await load();
  }} />;

  return <>
    {hero}
    <Sheet className="space-y-6">
      <SegmentedTabs label="Players" idBase="players" value={section} onChange={open} tabs={[
        // Counts are in the labels so phones show them too (tab badges are hidden on small screens).
        { value: "partners", label: answerCount ? `My partners (${answerCount})` : "My partners" },
        { value: "find", label: "Find" },
        { value: "shared", label: dueCount ? `Shared (${dueCount})` : "Shared" },
      ]} />
      {actionError && <Notice tone="error">{actionError}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      {section === "partners" && <div {...tabPanelProps("players", "partners")} className="space-y-6 outline-none">
        <PeopleSection sb={sb} data={data} people={people} act={act} busyId={busyId} reload={load} onOpen={open} />
      </div>}
      {section === "find" && <div {...tabPanelProps("players", "find")} className="space-y-4 outline-none">
        {data.buddyReady
          ? <FindSection sb={sb} userId={userId} data={data} injured={!!injury.open} act={act} busyId={busyId} reload={load} />
          : join}
      </div>}
      {section === "shared" && <div {...tabPanelProps("players", "shared")} className="space-y-6 outline-none">
        <SharedSection data={data} onOpen={open} />
      </div>}
    </Sheet>
  </>;
}
