import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check } from "lucide-react";
import { saveDataConsent, type PlayerProfile } from "../../lib/api/profile";
import { ACCENT_INK, CHECK, INK_2 } from "../theme";
import { Card, Notice, PickleSays, PreferenceSwitch, PrimaryButton } from "../shell/primitives";

export function ConsentStep({ sb, userId, profile, onDone }: { sb: SupabaseClient; userId: string; profile: PlayerProfile | null; onDone: () => void }) {
  const [analytics, setAnalytics] = useState(false);
  const [research, setResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function agree() {
    setBusy(true); setError("");
    try {
      await saveDataConsent(sb, userId, { analytics_opt_in: analytics, research_opt_in: research }, profile);
      onDone();
    } catch {
      setError("We couldn't save your choices. Please try again. If this keeps happening, ask the PicklePro team to check the data consent update.");
      setBusy(false);
    }
  }
  return <main className="mx-auto flex min-h-[85dvh] max-w-md flex-col gap-4 pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
    <button type="button" onClick={() => void sb.auth.signOut()} className="inline-flex min-h-[44px] items-center gap-1 self-start font-bold" style={{ color: ACCENT_INK }}><ArrowLeft size={16} /> Back</button>
    <PickleSays title="Before we start, your data.">Here's what I keep and why. Change it any time in Settings.</PickleSays>
    <Card className="border-t-4" >
      <h1 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: ACCENT_INK }}>What we collect</h1>
      <ul className="mt-3 space-y-3 text-base" style={{ color: INK_2 }}>
        {[<><b>Your profile:</b> name, email, level, how long and how often you play.</>, <><b>Your games:</b> scores, your 1–5 skill ratings and journal notes.</>, <><b>Videos, if you add one:</b> where you stood and your shots.</>].map((text, i) => <li key={i} className="flex gap-3"><Check className="mt-1 shrink-0" size={18} style={{ color: CHECK }} /><span>{text}</span></li>)}
      </ul>
      <p className="mt-4 text-base leading-relaxed" style={{ color: INK_2 }}>We use it to track your progress, show your stats and pick drills for you. Your password stays with our sign-in provider; PicklePro never stores it.</p>
    </Card>
    <Card className="!py-1">
      <PreferenceSwitch label="Keep my profile and games" detail="Required to use PicklePro." checked disabled />
      <PreferenceSwitch label="Performance analytics · optional" detail="Trends, win rate and tips from your games and videos." checked={analytics} disabled={busy} onChange={() => setAnalytics(!analytics)} />
      <PreferenceSwitch label="Help our research · optional" detail="Use my data, without my name, in the PicklePro study." checked={research} disabled={busy} onChange={() => setResearch(!research)} />
    </Card>
    {error && <Notice tone="error">{error}</Notice>}
    <PrimaryButton className="mt-auto w-full" disabled={busy} onClick={() => void agree()}>{busy ? "Saving…" : "Agree and continue"}</PrimaryButton>
    <a href="#/privacy" className="flex min-h-[44px] items-center justify-center text-sm font-bold underline" style={{ color: ACCENT_INK }}>Read the full privacy notice</a>
  </main>;
}
