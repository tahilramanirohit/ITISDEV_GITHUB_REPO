import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { ACCENT_INK } from "../theme";
import { CourtTests } from "./CourtTests";

/** #/tests: measured court tests, reached from Progress (and from onboarding). */
export default function TestsPage({ sb }: { sb: SupabaseClient }) {
  return <div className="space-y-3">
    <a href="#/progress" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold" style={{ color: ACCENT_INK }}>
      <ArrowLeft size={16} aria-hidden="true" /> Progress</a>
    <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.015em]">Court tests</h1>
    <CourtTests sb={sb} aboveTabBar />
  </div>;
}
