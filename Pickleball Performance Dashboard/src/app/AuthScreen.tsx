import { useState } from "react";

// Same palette as the dashboard
const BLUE_DEEP = "#071a3e";
const BLUE_MID = "#0d2554";
const NEON = "#b8f523";
const NEON_D = "#3d6000";
const BORDER = "rgba(100,160,255,0.18)";
const WHITE_DIM = "rgba(255,255,255,0.65)";
const WHITE_SUB = "rgba(255,255,255,0.40)";

type Props = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
};

export default function AuthScreen({ onSignIn, onSignUp }: Props) {
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "sign_up" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign_in") {
        await onSignIn(email.trim(), password);
      } else {
        await onSignUp(email.trim(), password);
        setInfo("Account created! You can now sign in.");
        setMode("sign_in");
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: BLUE_DEEP, fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="text-3xl font-black tracking-widest"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              color: NEON,
            }}
          >
            🏓 PICKLEPRO
          </div>
          <p className="text-sm text-center mt-2" style={{ color: WHITE_DIM }}>
            Pickleball Performance Dashboard
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: BLUE_MID,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 24px 64px rgba(7,26,62,0.7)",
          }}
        >
          <h2
            className="text-white mb-1 text-xl font-bold"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.04em",
            }}
          >
            {mode === "sign_in" ? "Sign In" : "Create Account"}
          </h2>
          <p className="text-xs mb-6" style={{ color: WHITE_SUB }}>
            {mode === "sign_in"
              ? "Sign in to access your dashboard."
              : "Create an account to start tracking your game."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: WHITE_SUB }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${BORDER}`,
                  color: "#fff",
                }}
              />
            </div>
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: WHITE_SUB }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${BORDER}`,
                  color: "#fff",
                }}
              />
            </div>

            {error && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: "rgba(249,115,22,0.15)", color: "#fed7aa" }}
              >
                {error}
              </div>
            )}
            {info && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: "rgba(184,245,35,0.12)", color: NEON }}
              >
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl py-3.5 font-bold text-sm disabled:opacity-60"
              style={{
                background: NEON,
                color: NEON_D,
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "1rem",
                letterSpacing: "0.08em",
              }}
            >
              {busy
                ? "PLEASE WAIT…"
                : mode === "sign_in"
                ? "SIGN IN →"
                : "CREATE ACCOUNT →"}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: WHITE_SUB }}>
            {mode === "sign_in" ? "No account? " : "Already have one? "}
            <button
              type="button"
              className="font-semibold"
              style={{ color: NEON }}
              onClick={() => {
                setMode(mode === "sign_in" ? "sign_up" : "sign_in");
                setError("");
                setInfo("");
              }}
            >
              {mode === "sign_in" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
