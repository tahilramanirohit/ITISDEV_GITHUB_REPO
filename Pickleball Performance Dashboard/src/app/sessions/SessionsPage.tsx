import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { Chip, Notice, ScreenTitle } from "../shell/primitives";
import { INK, WHITE, WHITE_SUB } from "../theme";
import { EmptySessions, reviewMode, SessionCard, useSessionsData } from "./sessionUi";

type Filter = "all" | "self" | "video";

export default function SessionsPage({ sb }: { sb: SupabaseClient }) {
  const { items, assessments, error } = useSessionsData(sb);
  const [filter, setFilter] = useState<Filter>("all");
  const byId = new Map(assessments.map((a) => [a.session_id, a]));
  const shown = (items ?? []).filter(({ session, video }) => filter === "all"
    || (filter === "video" ? reviewMode(session) === "video" || !!video : reviewMode(session) === "self" && !video));

  return (
    <div className="space-y-5">
      <ScreenTitle title="Your sessions" subtitle={items ? `${items.length} logged` : undefined}
        action={<a href="#/new" aria-label="Log a session" className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: INK, color: WHITE }}><Plus size={22} /></a>} />
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter sessions">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        <Chip selected={filter === "self"} onClick={() => setFilter("self")}>Self-assessed</Chip>
        <Chip selected={filter === "video"} onClick={() => setFilter("video")}>Video analysis</Chip>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {items === null ? <p className="text-sm" style={{ color: WHITE_SUB }}>Loading your sessions…</p>
        : items.length === 0 ? <EmptySessions />
        : shown.length === 0 ? <p className="text-sm" style={{ color: WHITE_SUB }}>No sessions match this filter.</p>
        : <ul className="grid gap-3 lg:grid-cols-2">{shown.map((item) => <li key={item.session.id}><SessionCard item={item} assessment={byId.get(item.session.id)} /></li>)}</ul>}
    </div>
  );
}
