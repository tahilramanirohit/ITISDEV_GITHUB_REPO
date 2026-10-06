import { lazy, Suspense, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config as defaultConfig, type AppConfig } from "../lib/config";
import { supabase as defaultSupabase } from "../lib/supabase";
import { devModeErrorText, guestErrorText } from "./auth/anonymousErrors";
import { AuthScreen, PasswordRecoveryScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { AppShell } from "./shell/AppShell";
import { OnboardingAgain, OnboardingGate } from "./onboarding/OnboardingGate";
import { Card, Notice, WidgetHeader } from "./shell/primitives";
import { GREEN, ORANGE, WHITE_DIM, WHITE_SUB } from "./theme";

// Loaded only when their routes are visited, so sample data and dev tools are
// not part of the main application bundle.
const DesignPreview = lazy(() => import("./design-preview/DesignPreview"));
const LocalPrototype = lazy(() => import("./local/LocalPrototype"));
const HomePage = lazy(() => import("./home/HomePage"));
const SessionsPage = lazy(() => import("./sessions/SessionsPage"));
const NewSessionPage = lazy(() => import("./sessions/NewSessionPage"));
const ProgressPage = lazy(() => import("./progress/ProgressPage"));
const SessionDetail = lazy(() => import("./sessions/SessionDetail"));
const ProfilePage = lazy(() => import("./profile/ProfilePage"));
const SettingsPage = lazy(() => import("./settings/SettingsPage"));
const LabelPage = lazy(() => import("./labelling/LabelPage"));
const PrivacyPage = lazy(() => import("./privacy/PrivacyPage"));

const Loading = () => <p className="p-8 text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

function DevLinks({ cfg }: { cfg: AppConfig }) {
  return (
    <>
      <a href="#/label" style={{ color: GREEN }}>Label shots</a>
      {cfg.localPrototypeEnabled && <a href="#/local-prototype" style={{ color: GREEN }}>Local prototype</a>}
      {cfg.designPreviewEnabled && <a href="#/design-preview" style={{ color: GREEN }}>Design preview (sample data)</a>}
    </>
  );
}

function SetupRequired({ cfg }: { cfg: AppConfig }) {
  return (
    <AppShell nav={<DevLinks cfg={cfg} />}>
      <Card accent={ORANGE}>
        <WidgetHeader title="Supabase is not configured" subtitle="Accounts, sessions and uploads need a Supabase project." accent={ORANGE} />
        {cfg.supabaseProblems.length > 0 && (
          <div className="mb-3">
            <Notice tone="warn">
              <strong>What is wrong:</strong>
              <ul className="list-disc pl-5 mt-1">
                {cfg.supabaseProblems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </Notice>
          </div>
        )}
        <ol className="text-sm space-y-2 list-decimal pl-5" style={{ color: WHITE_DIM }}>
          <li>
            Open <code>Pickleball Performance Dashboard\.env.local</code> (the dashboard folder, not the repository
            root or <code>server</code>). If it does not exist, copy <code>.env.example</code> to that name.
          </li>
          <li>
            Fill in both lines with values from the Supabase dashboard, <em>Project Settings → API</em>:
            <pre className="mt-1 rounded-lg p-2 text-xs overflow-x-auto" style={{ background: "#f3f4f6" }}>
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<the "anon" public key>`}
            </pre>
            The names must start with <code>VITE_</code>. Never use the service-role key here.
          </li>
          <li>
            On Windows, check that Notepad did not save the file as <code>.env.local.txt</code>: in File Explorer, turn on
            <em> View → File name extensions</em>, and rename it if needed.
          </li>
          <li>Stop the website (Ctrl+C) and start it again (<code>start_website.bat</code> or <code>npm run dev</code>). Changes to this file only apply after a restart.</li>
          <li>The Supabase project needs this repository's migrations applied once (see docs/SUPABASE_SETUP.md).</li>
        </ol>
        <p className="text-sm mt-4" style={{ color: WHITE_SUB }}>See docs/SUPABASE_SETUP.md. No sample results are shown in place of real ones.</p>
      </Card>
    </AppShell>
  );
}

function NotAvailable() {
  return (
    <AppShell>
      <Notice tone="warn">This page is not available in this build.</Notice>
    </AppShell>
  );
}

const prefetchSignedIn = () => {
  void import("./home/HomePage"); void import("./sessions/SessionsPage"); void import("./sessions/NewSessionPage");
  void import("./sessions/SessionDetail"); void import("./progress/ProgressPage"); void import("./profile/ProfilePage");
};

function SignedInApp({ sb, cfg }: { sb: SupabaseClient; cfg: AppConfig }) {
  const auth = useAuth(sb);
  const signedIn = auth.status === "signed_in";
  useEffect(() => {
    if (!signedIn) return;
    // After the first screen settles, fetch the other main screens so tab switches are instant.
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(prefetchSignedIn) : window.setTimeout(prefetchSignedIn, 1500);
    return () => { if (!idle) window.clearTimeout(id); };
  }, [signedIn]);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState("");

  async function enterGuest() {
    setGuestBusy(true);
    setGuestError("");
    try {
      const { error } = await sb.auth.signInAnonymously();
      if (error) throw error;
    } catch (e) {
      setGuestError(guestErrorText(e instanceof Error ? e.message : String(e)));
    } finally {
      setGuestBusy(false);
    }
  }

  async function enterDevMode() {
    setDevBusy(true);
    setDevError("");
    try {
      const { error: signInError } = await sb.auth.signInAnonymously();
      if (signInError) throw signInError;
      const { buildMockSessions } = await import("./dev/mockSessions");
      const { error: seedError } = await sb.rpc("seed_dev_mock_data", { p_sessions: buildMockSessions() });
      if (seedError) {
        await sb.auth.signOut();
        throw seedError;
      }
    } catch (e) {
      setDevError(devModeErrorText(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally {
      setDevBusy(false);
    }
  }

  if (auth.status === "loading") return <Loading />;
  if (auth.status === "signed_out") {
    return <AuthScreen sb={sb} samplePreviewEnabled={cfg.designPreviewEnabled} trialNoWorker={cfg.trialNoWorker}
      guestMode={cfg.guestModeEnabled ? { onEnter: () => void enterGuest(), busy: guestBusy, error: guestError } : undefined}
      devMode={cfg.devModeEnabled ? { onEnter: () => void enterDevMode(), busy: devBusy, error: devError } : undefined} />;
  }
  if (auth.status === "recovery") return <PasswordRecoveryScreen sb={sb} />;
  // Signed in, but the mock sessions are still being written.
  if (devBusy) return <p className="p-8 text-sm" style={{ color: WHITE_SUB }}>Creating mock data…</p>;
  const user = auth.session.user;
  const isGuest = !!user.is_anonymous && cfg.guestModeEnabled && !cfg.devModeEnabled;
  const account = user.is_anonymous ? (isGuest ? "Private guest" : "Dev mode (mock data)") : user.email ?? "Signed in";
  const signOutLabel = user.is_anonymous ? (isGuest ? "Leave guest session" : "Exit dev mode") : "Sign out";
  return (
    <OnboardingGate sb={sb} userId={user.id} skip={!!user.is_anonymous && !isGuest}>
    <AppShell tabs
      right={<span className="truncate rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "rgba(127,140,150,0.18)", color: "inherit", maxWidth: "12rem" }}>{account}</span>}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomePage sb={sb} userId={user.id} />} />
          <Route path="/sessions" element={<SessionsPage sb={sb} userId={user.id} />} />
          <Route path="/new" element={<NewSessionPage sb={sb} userId={user.id} trialNoWorker={cfg.trialNoWorker} />} />
          <Route path="/sessions/:sessionId" element={<SessionDetail sb={sb} userId={user.id} />} />
          <Route path="/progress" element={<ProgressPage sb={sb} />} />
          <Route path="/settings" element={<SettingsPage sb={sb} userId={user.id} account={account} devLinks={<DevLinks cfg={cfg} />} />} />
          <Route path="/profile" element={<ProfilePage sb={sb} userId={user.id} account={account}
            signOut={{ label: signOutLabel, onClick: () => void sb.auth.signOut(),
              warning: user.is_anonymous ? "You may lose access to this guest's sessions after leaving or clearing browser data." : undefined }} />} />
          <Route path="/welcome" element={<OnboardingAgain sb={sb} userId={user.id} />} />
          <Route path="*" element={<Notice tone="warn">Page not found.</Notice>} />
        </Routes>
      </Suspense>
    </AppShell>
    </OnboardingGate>
  );
}

export default function App({ cfg = defaultConfig, sb = defaultSupabase }: { cfg?: AppConfig; sb?: SupabaseClient | null }) {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPage />} />
          {/* Works without an account: videos and labels stay on this computer. */}
          <Route path="/label" element={<AppShell wide nav={<><a href="#/" style={{ color: GREEN }}>Home</a><DevLinks cfg={cfg} /></>}><LabelPage /></AppShell>} />
          <Route path="/design-preview" element={cfg.designPreviewEnabled ? <DesignPreview /> : <NotAvailable />} />
          <Route
            path="/local-prototype"
            element={cfg.localPrototypeEnabled
              ? <AppShell wide nav={<><a href="#/" style={{ color: GREEN }}>Home</a><DevLinks cfg={cfg} /></>}><LocalPrototype /></AppShell>
              : <NotAvailable />}
          />
          <Route path="/*" element={sb ? <SignedInApp sb={sb} cfg={cfg} /> : <SetupRequired cfg={cfg} />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
