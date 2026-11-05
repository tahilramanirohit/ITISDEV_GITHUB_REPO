import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buddyErrorText, getMyListing, listBuddyDetails, listBuddyPlayers, listMyRequests,
  type BuddyDetails, type BuddyPlayer, type BuddyRequest, type MyListing,
} from "../../lib/api/buddy";
import { listPartners, listSharedWithMe, partnerErrorText, type PartnerLink, type SharedSession } from "../../lib/api/partners";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { buildPeople, feedbackDue, type MySessionLite, type MyShare } from "../../lib/coaching/people";
import { WHITE_DIM } from "../theme";
import { Notice, PageHero, SegmentedTabs, Sheet, tabPanelProps } from "../shell/primitives";
import { announceBuddyChange } from "../buddy/useBuddyBadge";
import { useInjury } from "../recovery/RecoveryCard";
import { JoinCard } from "./parts";
import { FindSection } from "./FindSection";
import { InboxSection } from "./InboxSection";
import { PeopleSection } from "./PeopleSection";

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
};

export type Act = (id: string, fn: () => Promise<void>, done?: string) => Promise<void>;

export type Section = "people" | "find" | "inbox";
const SECTIONS: Section[] = ["people", "find", "inbox"];

async function loadSessions(sb: SupabaseClient, userId: string): Promise<{ sessions: MySessionLite[]; shares: MyShare[] }> {
  const [s, sh] = await Promise.all([
    sb.from("sessions").select("*").eq("owner_id", userId).order("session_date", { ascending: false }).limit(200),
    sb.from("report_shares").select("session_id, partner_id").eq("owner_id", userId).limit(1000),
  ]);
  return { sessions: (s.error ? [] : s.data ?? []) as MySessionLite[], shares: (sh.error ? [] : sh.data ?? []) as MyShare[] };
}

/**
 * Players: buddies and partners in one place (they are the same people at two levels of
 * trust). My people lists everyone you play with or coach with; Find is the Buddy list;
 * Inbox gathers everything waiting for an answer.
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
        loadSessions(sb, userId).catch(() => ({ sessions: [], shares: [] })),
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
  const inboxCount = data ? data.requests.filter((r) => r.direction === "incoming" && r.status === "pending").length
    + data.links.filter((l) => l.status === "pending" && l.direction === "received").length
    + data.shared.filter(feedbackDue).length : 0;

  // Without a section in the link, open where there is something to do, then stay there.
  const asked = params.get("section");
  const [first, setFirst] = useState<Section | null>(null);
  const loaded = data !== null;
  useEffect(() => {
    if (loaded && first === null) setFirst(inboxCount ? "inbox" : people.length || !data?.buddyReady ? "people" : "find");
  }, [loaded, first, inboxCount, people.length, data?.buddyReady]);
  const section: Section = SECTIONS.includes(asked as Section) ? asked as Section
    : first ?? (inboxCount ? "inbox" : people.length || !data?.buddyReady ? "people" : "find");
  const open = (next: Section) => {
    setNotice(null);
    setActionError("");
    setParams((p) => { const n = new URLSearchParams(p); n.set("section", next); return n; }, { replace: true });
  };

  const hero = <PageHero eyebrow="Play together, coach each other" title="Players"
    subtitle="Find someone to play with, then ask them for feedback on your game." />;
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
        { value: "people", label: "My people" },
        { value: "find", label: "Find" },
        // The count is in the label so phones show it too (tab badges are hidden on small screens).
        { value: "inbox", label: inboxCount ? `Inbox (${inboxCount})` : "Inbox" },
      ]} />
      {actionError && <Notice tone="error">{actionError}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      {section === "people" && <div {...tabPanelProps("players", "people")} className="space-y-6 outline-none">
        <PeopleSection sb={sb} data={data} people={people} act={act} busyId={busyId} reload={load} onOpen={open} />
      </div>}
      {section === "find" && <div {...tabPanelProps("players", "find")} className="space-y-4 outline-none">
        {data.buddyReady
          ? <FindSection sb={sb} userId={userId} data={data} injured={!!injury.open} act={act} busyId={busyId} reload={load} />
          : join}
      </div>}
      {section === "inbox" && <div {...tabPanelProps("players", "inbox")} className="space-y-6 outline-none">
        <InboxSection sb={sb} data={data} act={act} busyId={busyId} onOpen={open} />
      </div>}
    </Sheet>
  </>;
}
