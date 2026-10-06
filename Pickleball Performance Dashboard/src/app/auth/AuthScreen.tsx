import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Camera, ClipboardCheck, Dumbbell, FlaskConical, TrendingUp } from "lucide-react";
import mascotUrl from "../../assets/picklepro-mascot.webp";
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

  function openForm(next: Mode) {
    setMode(next); setError(""); setInfo("");
    window.setTimeout(() => {
      document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("email")?.focus({ preventScroll: true });
    }, 50);
  }

  const features = [
    { icon: ClipboardCheck, title: "Rate a game in about 2 minutes", text: "Ten quick skill ratings after you play, once your account is set up. No video needed." },
    { icon: Dumbbell, title: "Get a practice plan", text: "Focus areas, drills and targets picked for you, plus a week of practice." },
    { icon: TrendingUp, title: "See your progress", text: "Track solo practice, matches and tournaments over time." },
    { icon: Camera, title: "Add a video, if you like", text: trialNoWorker ? "Video analysis is paused on this trial." : "Computer vision maps where you stood on court." },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" style={{ background: PAGE_BG, color: INK, fontFamily: "'Inter', sans-serif" }}>
      {/* Welcome: the pickle mascot greets new players and explains the app. */}
      <section aria-labelledby="intro-title" className="relative flex flex-col overflow-hidden px-5 pb-8 md:px-10 md:pb-12 lg:sticky lg:top-0 lg:h-screen lg:justify-center lg:px-14 lg:pb-10 xl:px-20"
        style={{ background: NAVY, color: WHITE, paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full lg:h-[28rem] lg:w-[28rem]" style={{ background: OPTIC, opacity: 0.12 }} />
        <div aria-hidden="true" className="absolute -bottom-32 -left-20 h-64 w-64 rounded-full" style={{ background: GREEN, opacity: 0.25 }} />
        <div className="relative flex items-center justify-between gap-3 lg:absolute lg:inset-x-14 lg:top-8 xl:inset-x-20">
          <PickleProLogo size="sm" tone="dark" />
          <LargeTextToggle tone="dark" />
        </div>

        <div className="relative mt-6 flex items-end gap-3 md:mt-10 md:gap-6 lg:mt-12">
          <img src={mascotUrl} alt="Pickle, the PicklePro mascot, smiling and waving" className="pickle-hello h-40 w-auto shrink-0 md:h-56 lg:h-[24vh] lg:max-h-64 lg:min-h-[9rem]" />
          <div className="relative mb-10 rounded-2xl rounded-bl-md px-4 py-3 text-sm font-semibold leading-snug shadow-lg md:mb-16 md:px-5 md:py-4 md:text-base lg:mb-[8vh] lg:max-w-md"
            style={{ background: WHITE, color: INK }}>
            <span className="block text-base font-extrabold md:text-lg lg:text-xl" style={{ fontFamily: DISPLAY_FONT }}>Hi, I'm Pickle!</span>
            Tell me how your game went and I'll show you what to practice next.
          </div>
        </div>

        <div className="relative mt-6 md:mt-8 lg:mt-6">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: OPTIC }}>Welcome to PicklePro</p>
          <h1 id="intro-title" className="mt-2 text-[2rem] font-extrabold leading-[1.05] md:text-5xl lg:text-[clamp(2.25rem,4.2vh,3.5rem)]" style={{ fontFamily: DISPLAY_FONT }}>
            Your pickleball coach, in your pocket.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: "#c9dccf" }}>
            {trialNoWorker
              ? "Rate your own game for an instant practice plan, or explore the sample dashboard. Video analysis is not running on this public trial."
              : "PicklePro turns a quick look back at your game into a clear plan: what is working, what to work on, and the drills to get there. Your sessions stay private to you."}
          </p>
        </div>

        <ul className="relative mt-6 grid gap-3 sm:grid-cols-2" aria-label="What PicklePro does">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: OPTIC, color: OPTIC_INK }}><Icon size={20} /></span>
              <span><strong className="block text-sm md:text-base">{title}</strong><span className="mt-0.5 block text-sm" style={{ color: "#c9dccf" }}>{text}</span></span>
            </li>
          ))}
        </ul>

        <div className="relative mt-6 grid gap-2 sm:grid-cols-2 lg:hidden">
          <button type="button" onClick={() => openForm("sign_up")} className="min-h-[52px] rounded-full text-sm font-bold md:text-base" style={{ background: OPTIC, color: OPTIC_INK }}>
            Create my account
          </button>
          <button type="button" onClick={() => openForm("sign_in")} className="min-h-[52px] rounded-full text-sm font-bold md:text-base" style={{ background: "rgba(255,255,255,0.1)", color: WHITE }}>
            I already have an account
          </button>
        </div>
        {samplePreviewEnabled && <a href="#/design-preview" className="relative mt-4 inline-block self-start rounded-full px-4 py-2.5 text-sm font-bold"
          style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>Explore sample dashboard</a>}
      </section>

      <div className="px-4 py-8 md:px-10 md:py-12 lg:flex lg:min-h-screen lg:flex-col lg:justify-center lg:px-14 xl:px-20">
        <main className="mx-auto w-full max-w-md space-y-6 md:max-w-xl lg:max-w-md">
        <section id="auth" aria-labelledby="auth-title" className="scroll-mt-4 rounded-2xl p-6 md:p-8" style={{ background: WHITE, color: INK, border: `1px solid ${BORDER}`, boxShadow: CARD_GLOW }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: GREEN }}>Get started</p>
            {guestMode && <div className="mb-6">
              <button type="button" onClick={guestMode.onEnter} disabled={guestMode.busy || busy}
                className="w-full rounded-full py-3.5 text-sm font-bold disabled:opacity-60"
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
              Your sessions, videos and results are private to your account. <a href="#/privacy" className="font-semibold underline" style={{ color: GREEN }}>How we handle your data</a>
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
                className="w-full flex items-center justify-center gap-2 rounded-full py-3.5 font-bold text-sm disabled:opacity-60"
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
            <ol className="mt-3 rounded-2xl px-4" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
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
          <section aria-labelledby="example-plan-title" className="rounded-2xl p-5" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
            <p id="example-plan-title" className="text-xs font-bold uppercase tracking-wider" style={{ color: GREEN }}>Example from a practice plan</p>
            <p className="mt-2 text-base font-bold">Build your dinking · rated 2/5</p>
            <p className="mt-1 text-sm" style={{ color: WHITE_DIM }}>Low, patient dinks force opponents to hit up, giving you the first chance to attack.</p>
            <div className="mt-3 rounded-2xl p-3 text-sm" style={{ background: "#e3f6ea" }}>
              <strong style={{ color: GREEN }}>Drill: Cross-court dink count.</strong> Dink cross-court with a partner and count rallies without a ball going above net height plus 30 cm. Three rounds of two minutes; try to beat your best count.
            </div>
            <p className="mt-3 text-sm font-semibold">Next session: aim for 3/5, "Steady when unhurried".</p>
            <p className="mt-2 text-xs" style={{ color: WHITE_SUB }}>Sample only. Your plan comes from your own ratings.</p>
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
