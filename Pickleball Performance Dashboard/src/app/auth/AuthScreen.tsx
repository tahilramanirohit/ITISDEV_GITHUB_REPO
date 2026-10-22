import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, FlaskConical } from "lucide-react";
import { BODY_FONT, BORDER, GREEN, INK, NEON, NEON_D, ORANGE, PAGE_BG, PAPER, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Notice, PasswordInput, PickleProLogo, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { LargeTextToggle } from "../shell/AppShell";
import { BRAND_NAME, BRAND_TAGLINE, MASCOT_NAME } from "../brand";
import { Coach } from "../shell/Coach";

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

  function openForm(next: Mode) {
    setMode(next); setError(""); setInfo("");
    window.setTimeout(() => {
      document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("email")?.focus({ preventScroll: true });
    }, 50);
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" style={{ background: PAGE_BG, color: INK, fontFamily: BODY_FONT }}>
      {/* Welcome: Piko's one big moment. Wordmark small on top, one promise, one primary action. */}
      <section aria-labelledby="intro-title" className="flex flex-col px-5 pb-8 md:px-10 md:pb-12 lg:sticky lg:top-0 lg:h-screen lg:justify-center lg:px-14 lg:pb-10 xl:px-20"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between gap-3 lg:absolute lg:inset-x-14 lg:top-8 xl:inset-x-20 lg:w-[calc(53%-7rem)]">
          <PickleProLogo size="sm" tone="light" />
          <LargeTextToggle tone="light" />
        </div>

        <div className="mt-8 flex flex-col items-center text-center lg:mt-16 lg:items-start lg:text-left">
          <Coach size={190} title={`${MASCOT_NAME}, the ${BRAND_NAME} coach, holding a paddle`} />
          <p className="mt-4 type-label" style={{ color: GREEN }}>Hi, I'm {MASCOT_NAME}, your {BRAND_NAME} coach</p>
          <h1 id="intro-title" className="mt-2 max-w-[16ch] type-display-xl" style={{ textWrap: "balance" }}>{BRAND_TAGLINE}</h1>
          <p className="mt-3 max-w-md type-body" style={{ color: WHITE_DIM }}>
            {trialNoWorker
              ? "Rate your own game for an instant practice plan, or explore the sample dashboard. Video analysis is not running on this public trial."
              : "Rate your last game in about 2 minutes. I'll turn it into focus areas and drills. Your sessions stay private to you."}
          </p>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:hidden">
          <button type="button" onClick={() => openForm("sign_up")} className="min-h-[48px] rounded-[var(--radius-md)] type-body-strong" style={{ background: NEON, color: NEON_D }}>
            Get started
          </button>
          <button type="button" onClick={() => openForm("sign_in")} className="min-h-[48px] rounded-[var(--radius-md)] type-body-strong" style={{ color: INK, border: `1px solid ${BORDER}`, background: WHITE }}>
            I already have an account
          </button>
        </div>
        {samplePreviewEnabled && <a href="#/design-preview" className="mt-3 inline-flex min-h-[44px] items-center self-center text-sm font-bold lg:self-start"
          style={{ color: GREEN }}>Explore sample dashboard</a>}

        <ol className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="How it works">
          {(trialNoWorker ? [
            ["1", "Explore the sample", "Try the dashboard with clearly labelled example data."],
            ["2", "Create a session", "Plan a session and record a private check-in."],
            ["3", "Return later for video", "Upload opens when an online worker is available."],
          ] : [
            ["1", "Log a session", "Pick what you want to improve after you play."],
            ["2", "Rate your game", "10 quick skill ratings, or add a video."],
            ["3", "Get your plan", "Focus areas, drills and a week of practice."],
          ]).map(([number, title, detail]) => (
            <li key={number} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full type-body-strong" style={{ background: PAPER, color: GREEN }}>{number}</span>
              <span><strong className="block type-body-strong">{title}</strong><span className="block type-small" style={{ color: WHITE_DIM }}>{detail}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <div className="px-4 py-8 md:px-10 md:py-12 lg:flex lg:min-h-screen lg:flex-col lg:justify-center lg:px-14 xl:px-20">
        <main className="mx-auto w-full max-w-md space-y-6 md:max-w-xl lg:max-w-md">
        <section id="auth" aria-labelledby="auth-title" className="scroll-mt-4 rounded-[var(--radius-lg)] p-5 md:p-8" style={{ background: WHITE, color: INK, border: `1px solid ${BORDER}` }}>
            {guestMode && <div className="mb-6">
              <button type="button" onClick={guestMode.onEnter} disabled={guestMode.busy || busy}
                className="w-full min-h-[48px] rounded-[var(--radius-md)] px-4 type-body-strong disabled:opacity-60"
                style={{ color: INK, border: `1px solid ${BORDER}`, background: WHITE }}>
                {guestMode.busy ? "Opening your private session…" : "Try with my own video — no account needed"}
              </button>
              <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>
                Your guest sessions stay private in this browser. Keep this browser's data to return to them.
              </p>
              {guestMode.error && <div className="mt-2"><Notice tone="error">{guestMode.error}</Notice></div>}
              <p className="mt-5 border-t pt-4 text-sm" style={{ borderColor: BORDER, color: WHITE_SUB }}>Or use an account</p>
            </div>}
            <h2 id="auth-title" className="mb-1 type-display-lg">
              {mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create an account" : "Reset password"}
            </h2>
            <p className="mb-5 type-small" style={{ color: WHITE_DIM }}>
              Your sessions, videos and results are private to your account. <a href="#/privacy" className="font-bold underline" style={{ color: GREEN }}>How we handle your data</a>
            </p>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <label className={labelClass} style={labelStyle} htmlFor="email">Email address</label>
                <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 text-base" style={fieldStyle} />
              </div>
              {mode !== "reset" && <div>
                <label className={labelClass} style={labelStyle} htmlFor="password">Password</label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                  className="px-4 py-3 text-base" />
              </div>}
              {error && <Notice tone="error">{error}</Notice>}
              {info && <Notice>{info}</Notice>}
              <button type="submit" disabled={busy}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--radius-md)] type-body-strong disabled:opacity-60"
                style={{ background: NEON, color: NEON_D }}>
                {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : "Send reset link"} {!busy && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </form>
            {devMode && (
              <div className="mt-3">
                <button type="button" onClick={devMode.onEnter} disabled={devMode.busy || busy}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-bold disabled:opacity-60"
                  style={{ color: ORANGE, border: `1px dashed ${ORANGE}`, background: "transparent" }}>
                  <FlaskConical size={16} aria-hidden="true" />
                  {devMode.busy ? "Creating sample sessions…" : `Try ${BRAND_NAME} with sample sessions`}
                </button>
                <p className="text-sm mt-2 text-center" style={{ color: WHITE_SUB }}>
                  Dev mode uses a temporary guest account and sample results, not a real video analysis.
                </p>
                {devMode.error && <div className="mt-2"><Notice tone="error">{devMode.error}</Notice></div>}
              </div>
            )}
            {mode === "sign_in" && <button type="button" className="mt-3 min-h-[44px] text-sm font-bold underline" style={{ color: GREEN }}
              onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>Forgot password?</button>}
            <p className="mt-4 text-center type-small" style={{ color: WHITE_SUB }}>
              {mode === "sign_in" ? "No account yet? " : "Already registered? "}
              <button type="button" className="min-h-[44px] font-bold" style={{ color: GREEN }}
                onClick={() => { setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setError(""); setInfo(""); }}>
                {mode === "sign_in" ? "Create one" : "Sign in"}
              </button>
            </p>
          </section>
          <p className="text-center text-xs" style={{ color: WHITE_SUB }}>
            PicklePro research prototype · DLSU CAPIT-01 · <a href="#/privacy" className="underline" style={{ color: GREEN }}>Your data and privacy</a>
          </p>
        </main>
      </div>
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
    <h1 className="mt-6 type-display-lg">Choose a new password</h1>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className={labelClass} style={labelStyle} htmlFor="new-password">New password</label>
      <PasswordInput id="new-password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="px-4 py-3" />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className="min-h-[48px] w-full rounded-[var(--radius-md)] px-4 type-body-strong disabled:opacity-50"
        style={{ background: NEON, color: NEON_D }}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  </main>;
}
