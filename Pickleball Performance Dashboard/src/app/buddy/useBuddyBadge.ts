import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countWaitingRequests } from "../../lib/api/buddy";

const CHANGED = "picklepro:buddy-changed";
const REFRESH_MS = 60_000;

/** Tell the Buddy badge to refresh now (after accepting, declining or sending). */
export function announceBuddyChange() {
  window.dispatchEvent(new Event(CHANGED));
}

/** Number of buddy requests waiting for this player's answer, for the Buddy tab's badge. */
export function useBuddyBadge(sb: SupabaseClient, userId: string): number {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    let alive = true;
    const refresh = () => { void countWaitingRequests(sb, userId).then((n) => { if (alive) setCount(n); }); };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener(CHANGED, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(CHANGED, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sb, userId, pathname]);
  return count;
}
