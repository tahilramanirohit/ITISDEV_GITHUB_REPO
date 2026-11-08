import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countWaitingRequests } from "../../lib/api/buddy";
import { countWaitingInvites } from "../../lib/api/partners";
import { countPendingGameShares } from "../../lib/api/gameShares";

const CHANGED = "picklepro:buddy-changed";
const REFRESH_MS = 60_000;

/** Tell the Players badge to refresh now (after accepting, declining or sending). */
export function announceBuddyChange() {
  window.dispatchEvent(new Event(CHANGED));
}

/** Number of buddy requests waiting for this player's answer, for the Players tab's badge. */
export function useBuddyBadge(sb: SupabaseClient, userId: string): number {
  return useWaitingBadge(sb, userId, countWaitingRequests);
}

/** Number of partner invites waiting for this player's answer, for the Players tab's badge. */
export function usePartnerBadge(sb: SupabaseClient, userId: string): number {
  return useWaitingBadge(sb, userId, countWaitingInvites);
}

/** Number of games buddies shared that wait for this player's answer, for the Sessions tab's badge. */
export function useGameShareBadge(sb: SupabaseClient, userId: string): number {
  return useWaitingBadge(sb, userId, countWaitingGameShares);
}

async function countWaitingGameShares(sb: SupabaseClient, userId: string): Promise<number> {
  return countPendingGameShares(sb, userId);
}

function useWaitingBadge(sb: SupabaseClient, userId: string,
  countWaiting: (sb: SupabaseClient, userId: string) => Promise<number>): number {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    let alive = true;
    const refresh = () => { void countWaiting(sb, userId).then((n) => { if (alive) setCount(n); }); };
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
  }, [sb, userId, pathname, countWaiting]);
  return count;
}
