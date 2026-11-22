import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile, needsConsent, needsOnboarding, type PlayerProfile } from "../../lib/api/profile";
import { Notice, PrimaryButton } from "../shell/primitives";
import { DataUseContext, DATA_PREFERENCES_UPDATED } from "./DataUse";
import { ConsentStep } from "./ConsentStep";
import { WHITE_SUB } from "../theme";
import { AppShell } from "../shell/AppShell";
// Loaded only for players who still need it, so returning players never download it.
const Onboarding = lazy(() => import("./Onboarding").then((m) => ({ default: m.Onboarding })));

const Loading = () => <p className="p-8 text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

/** The database's reason, short: "PGRST106 · HTTP 406 · The schema must be one of …", "Failed to fetch" or "HTTP 404". */
export function profileErrorDetail(e: unknown): string {
  const err = (e ?? {}) as { code?: unknown; message?: unknown; status?: unknown };
  const message = typeof err.message === "string" ? err.message.trim() : "";
  const code = typeof err.code === "string" ? err.code : "";
  const status = typeof err.status === "number" && err.status > 0 ? `HTTP ${err.status}` : "";
  return [code, status, message].filter(Boolean).join(" · ").slice(0, 200) || "no message from the database";
}

/** The commit this site was built from (Vercel sets it at build time), so a screenshot shows which version is live. */
const BUILD = String((import.meta as { env?: Record<string, unknown> }).env?.VITE_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

/** Shows "getting to know you" once, before the app, until the player finishes it. */
export function OnboardingGate({ sb, userId, skip, children }: { sb: SupabaseClient; userId: string; skip: boolean; children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null | undefined>(skip ? null : undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(() => {
    getProfile(sb, userId).then((p) => { setProfile(p); setFailed(null); })
      // Fail closed: unknown consent must never open the app. Keep the database's reason, so a
      // setup problem (e.g. a new Supabase project with the Data API off) can be told apart.
      .catch((e: unknown) => { setProfile(null); setFailed(profileErrorDetail(e)); });
  }, [sb, userId]);
  useEffect(() => { if (!skip) load(); }, [skip, load]);
  useEffect(() => { window.addEventListener(DATA_PREFERENCES_UPDATED, load); return () => window.removeEventListener(DATA_PREFERENCES_UPDATED, load); }, [load]);

  if (skip) return <>{children}</>;
  if (failed !== null) return <AppShell><Notice tone="error">We couldn't load your data choices. Please try again.</Notice>
    <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>Details: {failed}{BUILD ? ` · build ${BUILD}` : ""}</p>
    <div className="mt-3"><PrimaryButton onClick={load}>Try again</PrimaryButton></div></AppShell>;
  if (profile === undefined) return <Loading />;
  if (needsConsent(profile)) return <AppShell><ConsentStep sb={sb} userId={userId} profile={profile} onDone={load} /></AppShell>;
  if (needsOnboarding(profile)) {
    return <AppShell><Suspense fallback={<Loading />}><Onboarding sb={sb} userId={userId} initial={profile} onDone={load} /></Suspense></AppShell>;
  }
  return <DataUseContext.Provider value={{ analytics: profile?.analytics_opt_in === true, research: profile?.research_opt_in === true }}>{children}</DataUseContext.Provider>;
}

/** Profile → "Update my answers": the same questions, prefilled. */
export function OnboardingAgain({ sb, userId }: { sb: SupabaseClient; userId: string }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null | undefined>(undefined);
  useEffect(() => { getProfile(sb, userId).then(setProfile).catch(() => setProfile(null)); }, [sb, userId]);
  if (profile === undefined) return <Loading />;
  return <Suspense fallback={<Loading />}><Onboarding sb={sb} userId={userId} initial={profile} onDone={() => navigate("/")} onCancel={() => navigate("/profile")} /></Suspense>;
}

/** Do not mount the optional trends page (or run its reads) without opt-in. */
export function AnalyticsGate({ sb, userId, children }: { sb: SupabaseClient; userId: string; children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>();
  useEffect(() => { let active = true; getProfile(sb, userId).then((p) => { if (active) setProfile(p); }).catch(() => { if (active) setProfile(null); }); return () => { active = false; }; }, [sb, userId]);
  if (profile === undefined) return <Loading />;
  if (profile?.analytics_opt_in !== true) return <Notice>Performance analytics is off. You can turn it on in <a className="inline-flex min-h-[44px] items-center font-bold underline" href="#/settings">Settings</a>. Your games and ratings are still available under Games.</Notice>;
  return <>{children}</>;
}
