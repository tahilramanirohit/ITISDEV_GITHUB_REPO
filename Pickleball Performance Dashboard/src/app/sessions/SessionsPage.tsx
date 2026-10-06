import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus, Trophy } from "lucide-react";
import { getProfile } from "../../lib/api/profile";
import { sessionKind } from "../../lib/api/types";
import { Chip, Notice, PageHero, Sheet } from "../shell/primitives";
import { INK, WHITE_SUB, YELLOW, YELLOW_INK } from "../theme";
import { EmptySessions, reviewMode, SessionCard, useSessionsData } from "./sessionUi";

type Filter = "all" | "self" | "video" | "tournament" | "solo";

export default function SessionsPage({ sb, userId }: { sb: SupabaseClient; userId?: string }) {
  const { items, assessments, players, error } = useSessionsData(sb);
  const [filter, setFilter] = useState<Filter>("all");
  const [you, setYou] = useState("You");
  useEffect(() => {
    if (!userId) return;
    getProfile(sb, userId).then((p) => { if (p?.display_name) setYou(p.display_name.split(" ")[0]); }).catch(() => {});
  }, [sb, userId]);
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
      <PageHero eyebrow="Your games" title="Sessions" subtitle={items ? `${items.length} logged` : undefined}
        action={<a href="#/new" aria-label="Log a session" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: YELLOW, color: YELLOW_INK }}><Plus size={22} /></a>} />
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
      {items === null ? <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
        : items.length === 0 ? <EmptySessions />
        : shown.length === 0 ? <p className="text-sm" style={{ color: WHITE_SUB }}>No sessions match this filter.</p>
        : groups.map(([title, list]) => (
          <section key={title || "all"} className="space-y-3" aria-label={title || undefined}>
            {title && <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: YELLOW, color: YELLOW_INK }}><Trophy size={16} aria-hidden="true" /></span>
              <h2 className="text-base font-extrabold" style={{ color: INK }}>{title}</h2>
              <span className="text-xs" style={{ color: WHITE_SUB }}>
                {list.length} match{list.length === 1 ? "" : "es"} · {list.filter((i) => i.session.match_result === "win").length} won
              </span>
            </div>}
            <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {list.map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} players={players.get(item.session.id)} you={you} /></li>)}
            </ul>
          </section>
        ))}
      </div>
      </Sheet>
    </div>
  );
}
