import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, FlaskConical } from "lucide-react";
import { BORDER, CARD_GLOW, DISPLAY_FONT, GREEN, INK, NEON, NEON_D, OPTIC, OPTIC_INK, ORANGE, PAGE_BG, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { Notice, PasswordInput, PickleProLogo, fieldStyle, labelClass, labelStyle, mascot2xUrl, pressable } from "../shell/primitives";
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

  function openForm(next: Mode) {
    setMode(next); setError(""); setInfo("");
  }

  return (
    <div className="min-h-dvh px-4 pb-6" style={{ background: PAGE_BG, color: INK, fontFamily: "var(--font-body)", paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <PickleProLogo size="sm" tone="light" />
        <LargeTextToggle tone="light" />
      </header>
      <main className="mx-auto w-full max-w-md pt-5 sm:pt-8">
        <div className="mb-5 flex items-center gap-4">
          <img src={mascot2xUrl} alt="Pickle, your coach" className="h-20 w-auto shrink-0" />
          <div>
            <h1 className="text-2xl font-extrabold leading-tight" style={{ fontFamily: DISPLAY_FONT }}>Your next better game.</h1>
            <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Rate your game. Get a plan. See your progress.</p>
          </div>
        </div>
        <section id="auth" aria-labelledby="auth-title" className="rounded-[18px] p-5 sm:p-6" style={{ background: WHITE, color: INK, border: `1px solid ${BORDER}`, boxShadow: CARD_GLOW }}>
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-[12px] p-1" style={{ background: PAGE_BG }} role="group" aria-label="Account access">
            {([["sign_in", "Sign in"], ["sign_up", "Create account"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-label={`Switch to ${label.toLowerCase()}`} aria-pressed={mode === value} disabled={busy}
                onClick={() => openForm(value)} className={`min-h-[44px] rounded-[9px] px-2 text-sm font-bold ${pressable}`}
                style={mode === value ? { background: OPTIC, color: OPTIC_INK } : { color: WHITE_DIM }}>
                {label}
              </button>
            ))}
          </div>
            <h2 id="auth-title" className="mb-1" style={{ fontFamily: DISPLAY_FONT, fontSize: "1.5rem", fontWeight: 800 }}>
              {mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create an account" : "Reset password"}
            </h2>
            <p className="text-sm mb-4" style={{ color: WHITE_DIM }}>
              {mode === "reset" ? "We’ll email you a link to choose a new password." : "Your game, your plan. Your sessions stay private."}
            </p>
            <form onSubmit={submit} className="space-y-3" noValidate>
              <div>
                <label className={labelClass} style={labelStyle} htmlFor="email">Email address</label>
                <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-[14px] px-4 py-3 text-base outline-none" style={fieldStyle} />
              </div>
              {mode !== "reset" && <div>
                <label className={labelClass} style={labelStyle} htmlFor="password">Password</label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                  className="rounded-[14px] px-4 py-3 text-base outline-none" />
                {mode === "sign_up" && <p className="mt-1 text-xs" style={{ color: WHITE_DIM }}>Use at least 8 characters.</p>}
              </div>}
              {error && <Notice tone="error">{error}</Notice>}
              {info && <Notice>{info}</Notice>}
              <button type="submit" disabled={busy}
                className={`w-full flex items-center justify-center gap-2 rounded-[12px] py-3.5 font-bold text-[0.95rem] ${pressable}`}
                style={{ background: OPTIC, color: OPTIC_INK }}>
                {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : "Send reset link"} {!busy && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </form>
            {guestMode && <div className="mt-5 border-t pt-4" style={{ borderColor: BORDER }}>
              <button type="button" onClick={guestMode.onEnter} disabled={guestMode.busy || busy}
                className={`w-full rounded-[12px] py-3.5 text-[0.95rem] font-bold ${pressable}`}
                style={{ background: OPTIC, color: OPTIC_INK }}>
                {guestMode.busy ? "Opening your private session…" : "Try with my own video, no account needed"}
              </button>
              <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>
                Your guest sessions stay private in this browser. Keep this browser's data to return to them.
              </p>
              {guestMode.error && <div className="mt-2"><Notice tone="error">{guestMode.error}</Notice></div>}
            </div>}
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
            {mode === "sign_in" && <button type="button" className="mt-3 min-h-[44px] text-sm underline" style={{ color: GREEN }}
              onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>Forgot password?</button>}
            {mode === "reset" && <button type="button" onClick={() => openForm("sign_in")} className="mt-4 min-h-[44px] text-sm font-semibold" style={{ color: GREEN }}>Back to sign in</button>}
          </section>
          {samplePreviewEnabled && <a href="#/design-preview" className="mt-3 flex min-h-[44px] items-center justify-center text-sm font-semibold" style={{ color: GREEN }}>Explore sample dashboard</a>}
          <details className="mt-4 rounded-[14px] border px-4" style={{ borderColor: BORDER }}>
            <summary className="flex min-h-[44px] cursor-pointer items-center justify-between text-sm font-semibold">How it works <span aria-hidden="true">+</span></summary>
            <ol className="space-y-3 pb-4 text-sm" style={{ color: WHITE_DIM }}>
              <li><strong style={{ color: INK }}>1. Log your game.</strong> Record what you played and rate your skills.</li>
              <li><strong style={{ color: INK }}>2. Get your plan.</strong> Find a focus and drills for your next session.</li>
              <li><strong style={{ color: INK }}>3. Track your progress.</strong> See how your game changes over time.</li>
            </ol>
          </details>
          {trialNoWorker && <p className="mt-3 text-center text-xs" style={{ color: WHITE_DIM }}>Video analysis is not running on this public trial. You can still rate your game and get a practice plan.</p>}
          <footer className="mt-4 text-center text-xs" style={{ color: WHITE_DIM }}>
            PicklePro research prototype · <a href="#/privacy" className="inline-flex min-h-[44px] items-center underline" style={{ color: GREEN }}>Your data and privacy</a>
          </footer>
      </main>
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
      <PasswordInput id="new-password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="rounded-xl px-4 py-3" />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className="w-full rounded-[14px] px-4 py-3 font-semibold disabled:opacity-50"
        style={{ background: NEON, color: NEON_D }}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  </main>;
}
