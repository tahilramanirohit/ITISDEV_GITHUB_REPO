import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, Trophy } from "lucide-react";
import { getProfile } from "../../lib/api/profile";
import { listGameShares, type GameShare } from "../../lib/api/gameShares";
import { sessionKind } from "../../lib/api/types";
import { Chip, Notice, PageHero, Sheet } from "../shell/primitives";
import { INK, WHITE_SUB, YELLOW, YELLOW_INK } from "../theme";
import { EmptySessions, reviewMode, SessionCard, SessionList, SharedGameRow, useSessionsData } from "./sessionUi";
import { GameShareRequests } from "./GameShareRequests";

type Filter = "all" | "self" | "video" | "tournament" | "solo";

export default function SessionsPage({ sb, userId }: { sb: SupabaseClient; userId?: string }) {
  const { items, assessments, players, error } = useSessionsData(sb);
  const [filter, setFilter] = useState<Filter>("all");
  const [you, setYou] = useState("You");
  useEffect(() => {
    if (!userId) return;
    getProfile(sb, userId).then((p) => { if (p?.display_name) setYou(p.display_name.split(" ")[0]); }).catch(() => {});
  }, [sb, userId]);
  // Games buddies named you in: requests to answer, and games you added (read-only).
  const [shares, setShares] = useState<GameShare[]>([]);
  const loadShares = useCallback(() => { listGameShares(sb).then((s) => setShares(s ?? [])).catch(() => {}); }, [sb]);
  useEffect(() => { loadShares(); }, [loadShares]);
  const requests = shares.filter((s) => s.status === "pending");
  const sharedShown = shares.filter((s) => s.status === "accepted" && (filter === "all"
    || (filter === "video" && s.has_video) || (filter === "tournament" && s.session_context === "tournament")));
  const byId = new Map(assessments.map((a) => [a.session_id, a]));
  const shown = (items ?? []).filter(({ session, video }) => {
    if (filter === "all") return true;
    if (filter === "tournament" || filter === "solo") return sessionKind(session) === filter;
    return filter === "video" ? reviewMode(session) === "video" || !!video : reviewMode(session) === "self" && !video;
  });
  // Tournament matches are grouped under their event, like a club's event page.
  const groups: [string, typeof shown][] = filter === "tournament"
    ? [...shown.reduce((m, item) => {
        const key = item.session.tournament_name?.trim() || "Unnamed tournament";
        return m.set(key, [...(m.get(key) ?? []), item]);
      }, new Map<string, typeof shown>())]
    : [["", shown]];

  return (
    <div>
      <PageHero band eyebrow="Your games" title="Sessions" subtitle={items ? `${items.length} logged` : undefined}
        action={<a href="#/new" aria-label="Log a session" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: YELLOW, color: YELLOW_INK }}><Plus size={22} /></a>} />
      <Sheet>
      <div className="space-y-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Filter sessions">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        <Chip selected={filter === "self"} onClick={() => setFilter("self")}>Self-assessed</Chip>
        <Chip selected={filter === "video"} onClick={() => setFilter("video")}>Video analysis</Chip>
        <Chip selected={filter === "tournament"} onClick={() => setFilter("tournament")}>Tournaments</Chip>
        <Chip selected={filter === "solo"} onClick={() => setFilter("solo")}>Solo practice</Chip>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <GameShareRequests sb={sb} requests={requests} onChanged={loadShares} />
      {items === null ? <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
        : items.length === 0 && !sharedShown.length ? <EmptySessions />
        : shown.length === 0 && !sharedShown.length ? <p className="text-sm" style={{ color: WHITE_SUB }}>No sessions match this filter.</p>
        : groups.map(([title, list]) => (
          <section key={title || "all"} className="space-y-3" aria-label={title || undefined}>
            {title && <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: YELLOW, color: YELLOW_INK }}><Trophy size={16} aria-hidden="true" /></span>
              <h2 className="text-base font-extrabold" style={{ color: INK }}>{title}</h2>
              <span className="text-xs" style={{ color: WHITE_SUB }}>
                {list.length} match{list.length === 1 ? "" : "es"} · {list.filter((i) => i.session.match_result === "win").length} won
              </span>
            </div>}
            <SessionList label={title || "Your sessions"}>
              {mergeByDate(list, title ? [] : sharedShown).map((entry) => "share" in entry
                ? <li key={`shared-${entry.share.id}`}><SharedGameRow share={entry.share} /></li>
                : <li key={entry.session.id}><SessionCard item={entry} assessment={byId.get(entry.session.id)} players={players.get(entry.session.id)} you={you} /></li>)}
            </SessionList>
          </section>
        ))}
      </div>
      </Sheet>
    </div>
  );
}

/** Your games and games shared with you, newest first. */
function mergeByDate<T extends { session: { session_date: string } }>(own: T[], shared: GameShare[]): (T | { share: GameShare })[] {
  const rows: (T | { share: GameShare })[] = [...own, ...shared.map((share) => ({ share }))];
  const date = (r: T | { share: GameShare }) => ("share" in r ? r.share.session_date : r.session.session_date);
  return rows.sort((a, b) => date(b).localeCompare(date(a)));
}
