import { lazy, Suspense, useState } from "react";
import { HashRouter, Route, Routes } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config as defaultConfig, type AppConfig } from "../lib/config";
import { supabase as defaultSupabase } from "../lib/supabase";
import { devModeErrorText, guestErrorText } from "./auth/anonymousErrors";
import { AuthScreen, PasswordRecoveryScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/useAuth";
import { AppShell } from "./shell/AppShell";
import { Card, Notice, WidgetHeader } from "./shell/primitives";
import { LAVENDER, ORANGE, WHITE, WHITE_DIM, WHITE_SUB } from "./theme";

// Loaded only when their routes are visited, so sample data and dev tools are
// not part of the main application bundle.
const DesignPreview = lazy(() => import("./design-preview/DesignPreview"));
const LocalPrototype = lazy(() => import("./local/LocalPrototype"));
const SessionsPage = lazy(() => import("./sessions/SessionsPage"));
const SessionDetail = lazy(() => import("./sessions/SessionDetail"));
const ProfilePage = lazy(() => import("./profile/ProfilePage"));
const LabelPage = lazy(() => import("./labelling/LabelPage"));

const Loading = () => <p className="p-8 text-sm" style={{ color: WHITE_SUB }}>Loading…</p>;

function DevLinks({ cfg }: { cfg: AppConfig }) {
  return (
    <>
      <a href="#/label" style={{ color: LAVENDER }}>Label shots</a>
      {cfg.localPrototypeEnabled && <a href="#/local-prototype" style={{ color: LAVENDER }}>Local prototype</a>}
      {cfg.designPreviewEnabled && <a href="#/design-preview" style={{ color: LAVENDER }}>Design preview (sample data)</a>}
    </>
  );
}

function SetupRequired({ cfg }: { cfg: AppConfig }) {
  return (
    <AppShell nav={<DevLinks cfg={cfg} />}>
      <Card accent={ORANGE}>
        <WidgetHeader title="Supabase is not configured" subtitle="Accounts, sessions and uploads need a Supabase project." accent={ORANGE} />
        <ol className="text-sm space-y-2 list-decimal pl-5" style={{ color: WHITE_DIM }}>
          <li>Copy <code>.env.example</code> to <code>.env.local</code> in the dashboard folder.</li>
          <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (public anon key only).</li>
          <li>Apply the migrations in <code>supabase/migrations</code> and restart <code>npm run dev</code>.</li>
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

function SignedInApp({ sb, cfg }: { sb: SupabaseClient; cfg: AppConfig }) {
  const auth = useAuth(sb);
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
  return (
    <AppShell
      nav={<><a href="#/" style={{ color: WHITE }}>My sessions</a><a href="#/profile" style={{ color: WHITE }}>Profile</a><DevLinks cfg={cfg} /></>}
      right={
        <div className="flex items-center gap-3 text-sm">
          <span style={{ color: WHITE }}>
            {user.is_anonymous ? (isGuest ? "Private guest" : "Dev mode (mock data)") : user.email}
          </span>
          <button type="button" onClick={() => void sb.auth.signOut()} className="px-3 py-1.5 rounded-lg"
            title={user.is_anonymous ? "You may lose access to this guest's sessions after leaving or clearing browser data." : undefined}
            style={{ color: WHITE, border: "1px solid #64718e" }}>{user.is_anonymous ? (isGuest ? "Leave guest session" : "Exit dev mode") : "Sign out"}</button>
        </div>
      }
    >
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<SessionsPage sb={sb} />} />
          <Route path="/sessions/:sessionId" element={<SessionDetail sb={sb} userId={user.id} />} />
          <Route path="/profile" element={<ProfilePage sb={sb} userId={user.id} />} />
          <Route path="*" element={<Notice tone="warn">Page not found.</Notice>} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App({ cfg = defaultConfig, sb = defaultSupabase }: { cfg?: AppConfig; sb?: SupabaseClient | null }) {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Works without an account: videos and labels stay on this computer. */}
          <Route path="/label" element={<AppShell nav={<><a href="#/" style={{ color: WHITE }}>Home</a><DevLinks cfg={cfg} /></>}><LabelPage /></AppShell>} />
          <Route path="/design-preview" element={cfg.designPreviewEnabled ? <DesignPreview /> : <NotAvailable />} />
          <Route
            path="/local-prototype"
            element={cfg.localPrototypeEnabled
              ? <AppShell nav={<><a href="#/" style={{ color: WHITE }}>Home</a><DevLinks cfg={cfg} /></>}><LocalPrototype /></AppShell>
              : <NotAvailable />}
          />
          <Route path="/*" element={sb ? <SignedInApp sb={sb} cfg={cfg} /> : <SetupRequired cfg={cfg} />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
