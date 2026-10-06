import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile, needsOnboarding, type PlayerProfile } from "../../lib/api/profile";
import { WHITE_SUB } from "../theme";
import { AppShell } from "../shell/AppShell";
// Loaded only for players who still need it, so returning players never download it.
const Onboarding = lazy(() => import("./Onboarding").then((m) => ({ default: m.Onboarding })));

const Loading = () => <p className="p-8 text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

/** Shows "getting to know you" once, before the app, until the player finishes it. */
export function OnboardingGate({ sb, userId, skip, children }: { sb: SupabaseClient; userId: string; skip: boolean; children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null | undefined>(skip ? null : undefined);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    getProfile(sb, userId).then((p) => { setProfile(p); setFailed(false); })
      // A failed lookup must not lock the player out of their sessions.
      .catch(() => { setProfile(null); setFailed(true); });
  }, [sb, userId]);
  useEffect(() => { if (!skip) load(); }, [skip, load]);

  if (skip || failed) return <>{children}</>;
  if (profile === undefined) return <Loading />;
  if (needsOnboarding(profile)) {
    return <AppShell><Suspense fallback={<Loading />}><Onboarding sb={sb} userId={userId} initial={profile} onDone={load} /></Suspense></AppShell>;
  }
  return <>{children}</>;
}

/** Profile → "Update my answers": the same questions, prefilled. */
export function OnboardingAgain({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null | undefined>(undefined);
  useEffect(() => { getProfile(sb, userId).then(setProfile).catch(() => setProfile(null)); }, [sb, userId]);
  if (profile === undefined) return <Loading />;
  return <Suspense fallback={<Loading />}><Onboarding sb={sb} userId={userId} initial={profile} onDone={() => navigate("/")} onCancel={() => navigate("/profile")} /></Suspense>;
}
