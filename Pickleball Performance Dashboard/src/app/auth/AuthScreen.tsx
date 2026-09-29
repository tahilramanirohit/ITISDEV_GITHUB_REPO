import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, FlaskConical } from "lucide-react";
import { COBALT, DISPLAY_FONT, INK, LAVENDER, NAVY, NEON, NEON_D, PAGE_BG } from "../theme";
import { Notice, PickleProLogo, fieldStyle, labelClass, labelStyle } from "../shell/primitives";
import { LargeTextToggle } from "../shell/AppShell";

type Mode = "sign_in" | "sign_up" | "reset";

/** Testing deployments: enter as an anonymous user with generated mock sessions. */
export type DevModeEntry = { onEnter: () => void; busy: boolean; error: string };

/** Supabase email + password authentication. Replaces the former hard-coded demo account. */
export function AuthScreen({ sb, devMode }: { sb: SupabaseClient; devMode?: DevModeEntry }) {
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
      <header className="border-b" style={{ background: NAVY, borderColor: "#354262" }}>
        <div className="mx-auto max-w-7xl px-5 py-4 sm:px-8 lg:px-12 flex items-center justify-between gap-3">
          <PickleProLogo size="sm" tone="dark" />
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-sm font-bold uppercase tracking-widest" style={{ color: LAVENDER }}>Your game, made clearer</span>
            <LargeTextToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-10 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-16 lg:px-12 lg:py-16">
        <section aria-labelledby="intro-title">
          <p className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: COBALT }}>Pickleball video coaching / beta</p>
          <h1 id="intro-title" className="mt-5 font-extrabold uppercase tracking-tight" style={{ fontFamily: DISPLAY_FONT,
            fontSize: "clamp(3.6rem, 9vw, 8.5rem)", lineHeight: 0.83 }}>
            See your game.<br /><span style={{ color: COBALT }}>Know what to practice.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "#354052" }}>
            Choose a practice focus, upload a video of your play, and review what PicklePro can measure with its evidence limits.
          </p>
          <p className="mt-5 max-w-xl text-sm leading-relaxed" style={{ color: "#4d5664" }}>
            <strong>Court positions can be reviewed now.</strong> Personalized practice advice and shot labels await evaluation on real match footage.
          </p>
        </section>

        <section aria-labelledby="auth-title" className="p-6 sm:p-8" style={{ background: NAVY, color: "white", border: "1px solid #354262" }}>
          <p className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: LAVENDER }}>Get started</p>
          <h2 id="auth-title" className="text-white mb-1" style={{ fontFamily: DISPLAY_FONT, letterSpacing: "0.02em", fontSize: "2rem", fontWeight: 700 }}>
            {mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create an account" : "Reset password"}
          </h2>
          <p className="text-sm mb-6" style={{ color: "#d4d9e5" }}>
            Your sessions, videos and results are private to your account.
          </p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label className={labelClass} style={{ ...labelStyle, color: "#d4d9e5" }} htmlFor="email">Email address</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={fieldStyle} />
            </div>
            {mode !== "reset" && <div>
              <label className={labelClass} style={{ ...labelStyle, color: "#d4d9e5" }} htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={fieldStyle} />
            </div>}
            {error && <Notice tone="error" onDark>{error}</Notice>}
            {info && <Notice onDark>{info}</Notice>}
            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 font-bold text-sm disabled:opacity-60"
              style={{ background: NEON, color: NEON_D }}>
              {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : "Send reset link"} {!busy && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>
          {devMode && (
            <div className="mt-3">
              <button type="button" onClick={devMode.onEnter} disabled={devMode.busy || busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
                style={{ color: "#ffc19f", border: "1px dashed #ffc19f", background: "transparent" }}>
                <FlaskConical size={14} />
                {devMode.busy ? "Creating sample sessions…" : "Try PicklePro with sample sessions"}
              </button>
              <p className="text-sm mt-2 text-center" style={{ color: "#b5c0d4" }}>
                Dev mode uses a temporary guest account and sample results, not a real video analysis.
              </p>
              {devMode.error && <div className="mt-2"><Notice tone="error" onDark>{devMode.error}</Notice></div>}
            </div>
          )}
          {mode === "sign_in" && <button type="button" className="mt-4 text-sm underline" style={{ color: LAVENDER }}
            onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>Forgot password?</button>}
          <p className="text-center text-sm mt-6" style={{ color: "#b5c0d4" }}>
            {mode === "sign_in" ? "No account yet? " : "Already registered? "}
            <button type="button" className="font-semibold" style={{ color: LAVENDER }}
              onClick={() => { setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setError(""); setInfo(""); }}>
              {mode === "sign_in" ? "Create one" : "Sign in"}
            </button>
          </p>
        </section>
        <section aria-labelledby="how-it-works-title" className="lg:col-start-1 lg:row-start-2">
          <h2 id="how-it-works-title" className="text-sm font-bold uppercase tracking-widest" style={{ color: COBALT }}>How it works</h2>
          <ol className="mt-4 max-w-xl border-t" style={{ borderColor: "#bfc2c7" }}>
            {[
              ["01", "Choose a focus", "Tell PicklePro what you want to work on."],
              ["02", "Upload your video", "Use a handheld or fixed-camera recording."],
              ["03", "Review feedback", "See observations, limits, and what to try next."],
            ].map(([number, title, detail]) => (
              <li key={number} className="grid grid-cols-[3.5rem_1fr] gap-3 border-b py-3" style={{ borderColor: "#bfc2c7" }}>
                <span className="font-mono text-sm font-bold" style={{ color: COBALT }}>{number}</span>
                <span><strong className="block text-sm">{title}</strong><span className="block text-sm mt-0.5" style={{ color: "#5a6471" }}>{detail}</span></span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="mx-auto max-w-7xl px-5 pb-6 text-sm sm:px-8 lg:px-12" style={{ color: "#69727c" }}>
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

  return <main className="mx-auto max-w-md p-6 sm:p-10">
    <h1 className="text-2xl font-bold">Choose a new password</h1>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-semibold" htmlFor="new-password">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl px-4 py-3" style={fieldStyle} />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={busy} className="rounded-xl px-4 py-3 font-semibold disabled:opacity-50"
        style={{ background: NEON, color: NEON_D }}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  </main>;
}
