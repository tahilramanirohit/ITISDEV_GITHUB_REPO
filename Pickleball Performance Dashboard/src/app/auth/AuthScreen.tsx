import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, FlaskConical } from "lucide-react";
import { BORDER, CARD_GLOW, DISPLAY_FONT, GREEN, INK, NAVY, NEON, NEON_D, OPTIC, OPTIC_INK, ORANGE, PAGE_BG, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Notice, PickleProLogo, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { LargeTextToggle } from "../shell/AppShell";

type Mode = "sign_in" | "sign_up" | "reset";

/** Testing deployments: enter as an anonymous user with generated mock sessions. */
export type DevModeEntry = { onEnter: () => void; busy: boolean; error: string };
export type GuestModeEntry = { onEnter: () => void; busy: boolean; error: string };

/** Supabase email + password authentication. Replaces the former hard-coded demo account. */
export function AuthScreen({ sb, devMode, guestMode, samplePreviewEnabled = false, trialNoWorker = false }: {
  sb: SupabaseClient; devMode?: DevModeEntry; guestMode?: GuestModeEntry; samplePreviewEnabled?: boolean; trialNoWorker?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || (mode !== "reset" && !password)) return setError("Enter your email and password.");
    if (mode === "sign_up" && password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) throw error;
        setInfo("If this account exists, a password reset link is on its way. Check your email.");
      } else if (mode === "sign_in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: PAGE_BG, color: INK, fontFamily: "'Inter', sans-serif" }}>
      <main className="mx-auto max-w-md space-y-6 px-4 pb-10" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between gap-3">
          <PickleProLogo size="sm" tone="light" />
          <LargeTextToggle />
        </div>
        <section aria-labelledby="intro-title" className="relative overflow-hidden rounded-3xl p-6" style={{ background: NAVY, color: "white" }}>
          <div aria-hidden="true" className="absolute -right-12 -top-12 h-44 w-44 rounded-full" style={{ background: OPTIC, opacity: 0.2 }} />
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: OPTIC }}>Your pickleball coach</p>
          <h1 id="intro-title" className="mt-2 text-[2rem] font-extrabold leading-[1.05]" style={{ fontFamily: DISPLAY_FONT }}>
            Know what to practice next.
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "#c9cdd4" }}>
            {trialNoWorker
              ? "Rate your own game for an instant practice plan, or explore the sample dashboard. Video analysis is not running on this public trial."
              : "Rate your own game after you play and get focus areas, drills and a weekly plan. Add a video any time for court-position analysis."}
          </p>
          {samplePreviewEnabled && <a href="#/design-preview" className="mt-4 inline-block rounded-2xl px-4 py-2.5 text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>Explore sample dashboard</a>}
        </section>

        <section aria-labelledby="auth-title" className="rounded-3xl p-6" style={{ background: WHITE, color: INK, border: `1px solid ${BORDER}`, boxShadow: CARD_GLOW }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: GREEN }}>Get started</p>
          {guestMode && <div className="mb-6">
            <button type="button" onClick={guestMode.onEnter} disabled={guestMode.busy || busy}
              className="w-full rounded-2xl py-3.5 text-sm font-bold disabled:opacity-60"
              style={{ background: OPTIC, color: OPTIC_INK }}>
              {guestMode.busy ? "Opening your private session…" : "Try with my own video — no account needed"}
            </button>
            <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>
              Your guest sessions stay private in this browser. Keep this browser's data to return to them.
            </p>
            {guestMode.error && <div className="mt-2"><Notice tone="error">{guestMode.error}</Notice></div>}
            <p className="mt-5 border-t pt-4 text-sm" style={{ borderColor: BORDER, color: WHITE_SUB }}>Or use an account</p>
          </div>}
          <h2 id="auth-title" className="mb-1" style={{ fontFamily: DISPLAY_FONT, fontSize: "1.5rem", fontWeight: 800 }}>
            {mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create an account" : "Reset password"}
          </h2>
          <p className="text-sm mb-5" style={{ color: WHITE_DIM }}>
            Your sessions, videos and results are private to your account.
          </p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label className={labelClass} style={labelStyle} htmlFor="email">Email address</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 text-base outline-none" style={fieldStyle} />
            </div>
            {mode !== "reset" && <div>
              <label className={labelClass} style={labelStyle} htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                className="w-full rounded-2xl px-4 py-3 text-base outline-none" style={fieldStyle} />
            </div>}
            {error && <Notice tone="error">{error}</Notice>}
            {info && <Notice>{info}</Notice>}
            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-sm disabled:opacity-60"
              style={{ background: NEON, color: NEON_D }}>
              {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : "Send reset link"} {!busy && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>
          {devMode && (
            <div className="mt-3">
              <button type="button" onClick={devMode.onEnter} disabled={devMode.busy || busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
                style={{ color: ORANGE, border: `1px dashed ${ORANGE}`, background: "transparent" }}>
                <FlaskConical size={14} />
                {devMode.busy ? "Creating sample sessions…" : "Try PicklePro with sample sessions"}
              </button>
              <p className="text-sm mt-2 text-center" style={{ color: WHITE_SUB }}>
                Dev mode uses a temporary guest account and sample results, not a real video analysis.
              </p>
              {devMode.error && <div className="mt-2"><Notice tone="error">{devMode.error}</Notice></div>}
            </div>
          )}
          {mode === "sign_in" && <button type="button" className="mt-4 text-sm underline" style={{ color: GREEN }}
            onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>Forgot password?</button>}
          <p className="text-center text-sm mt-6" style={{ color: WHITE_SUB }}>
            {mode === "sign_in" ? "No account yet? " : "Already registered? "}
            <button type="button" className="font-semibold" style={{ color: GREEN }}
              onClick={() => { setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setError(""); setInfo(""); }}>
              {mode === "sign_in" ? "Create one" : "Sign in"}
            </button>
          </p>
        </section>
        <section aria-labelledby="how-it-works-title">
          <h2 id="how-it-works-title" className="text-xs font-bold uppercase tracking-wider" style={{ color: GREEN }}>How it works</h2>
          <ol className="mt-3 rounded-3xl px-4" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
            {(trialNoWorker ? [
              ["01", "Explore the sample", "Try the interactive dashboard with clearly labelled example data."],
              ["02", "Create a session", "Try planning a session and recording a private check-in."],
              ["03", "Return later for video", "Upload and analysis will open when an online worker is available."],
            ] : [
              ["01", "Log a session", "Pick what you want to improve after you play."],
              ["02", "Rate your game", "Ten quick skill ratings, or add a video for court analysis."],
              ["03", "Get your plan", "Focus areas, drills and a week of practice."],
            ]).map(([number, title, detail]) => (
              <li key={number} className="grid grid-cols-[2.5rem_1fr] gap-3 border-b py-3 last:border-b-0" style={{ borderColor: BORDER }}>
                <span className="text-sm font-extrabold" style={{ color: GREEN, fontFamily: DISPLAY_FONT }}>{number}</span>
                <span><strong className="block text-sm">{title}</strong><span className="block text-sm mt-0.5" style={{ color: "#5a6471" }}>{detail}</span></span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="mx-auto max-w-md px-4 pb-6 text-center text-xs" style={{ color: WHITE_SUB }}>
        PicklePro research prototype · DLSU CAPIT-01
      </footer>
    </div>
  );
}

export function PasswordRecoveryScreen({ sb }: { sb: SupabaseClient }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    setError("");
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      await sb.auth.signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-md p-6">
    <PickleProLogo size="sm" tone="light" />
    <h1 className="mt-6 text-2xl font-extrabold" style={{ fontFamily: DISPLAY_FONT }}>Choose a new password</h1>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-semibold" htmlFor="new-password">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl px-4 py-3" style={fieldStyle} />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className="w-full rounded-2xl px-4 py-3 font-semibold disabled:opacity-50"
        style={{ background: NEON, color: NEON_D }}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  </main>;
}
