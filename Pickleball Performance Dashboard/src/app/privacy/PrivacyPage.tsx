import { ArrowLeft } from "lucide-react";
import { config } from "../../lib/config";
import { DEFAULT_UPLOAD_LIMITS } from "../../lib/upload/limits";
import { BORDER, DISPLAY_FONT, GREEN, INK, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { PickleProLogo } from "../shell/primitives";

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "What PicklePro stores",
    items: [
      "Your account: email address. Passwords are handled by our sign-in provider (Supabase) and are never visible to the app.",
      "Your profile and setup answers: name, experience, level, goals, starting skill ratings and default settings.",
      "Your sessions: date, type, format, tournament details and the names you type for partners or opponents. Those names are not linked to anyone's account.",
      "Your self-ratings and wrap-up answers, and the private Journal: warm-up, sleep, readiness, exertion, soreness and reflections. Journal entries are context for you, not medical scores.",
      "Videos you upload, the analysis results (player and ball positions, player thumbnails, court lines, shot suggestions), and a record that you confirmed recording consent.",
    ],
  },
  {
    title: "Who can see it",
    items: [
      "Inside the app, only you. Database rules limit every record to the account that created it; other players cannot see your sessions, ratings, names you entered or videos.",
      "The PicklePro project team runs the database and the computer that analyzes videos, so team members with administrator access can reach stored data to operate and fix the prototype.",
      "PicklePro is a research prototype from a DLSU capstone project (CAPIT-01). Ask the project team how data is used in the study before you take part.",
    ],
  },
  {
    title: "How long it is kept",
    items: [
      "Raw videos are deleted automatically 30 days after analysis, unless you choose “Keep this recording” on the session. The analysis result stays until you delete the session.",
      `Upload limits: ${DEFAULT_UPLOAD_LIMITS.max_file_bytes / 1_000_000} MB per video, ${DEFAULT_UPLOAD_LIMITS.max_uploads_per_day} uploads a day and ${DEFAULT_UPLOAD_LIMITS.max_total_bytes / 1_000_000_000} GB of stored video per player.`,
      "Everything else stays until you delete it.",
    ],
  },
  {
    title: "Deleting your data",
    items: [
      "Delete a session from its page (the bin icon). This removes its ratings, Journal entries, player names, video and results.",
      "Guest sessions are tied to this browser. Clearing browser data or leaving the guest session can lose access to them.",
      "To delete your whole account or get a copy of your data, contact the project team.",
    ],
  },
];

/** Plain-language data-use explanation, reachable before sign-up and from Profile. */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "#f4f5f7", color: INK, fontFamily: "'Inter', sans-serif" }}>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-6 md:py-10">
        <div className="flex items-center justify-between gap-3">
          <a href="#/" aria-label="PicklePro home"><PickleProLogo size="sm" tone="light" /></a>
          <a href="#/" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold" style={{ color: GREEN }}><ArrowLeft size={16} /> Back</a>
        </div>
        <div>
          <h1 className="text-[1.75rem] font-extrabold leading-tight md:text-4xl" style={{ fontFamily: DISPLAY_FONT }}>Your data and privacy</h1>
          <p className="mt-2 text-sm" style={{ color: WHITE_DIM }}>What PicklePro keeps, who can see it, and how to remove it.</p>
        </div>
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl p-5" style={{ background: WHITE, border: `1px solid ${BORDER}` }} aria-labelledby={`privacy-${section.title}`}>
            <h2 id={`privacy-${section.title}`} className="text-lg font-bold" style={{ fontFamily: DISPLAY_FONT }}>{section.title}</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed" style={{ color: INK }}>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
        <section className="rounded-2xl p-5" style={{ background: "#eef0ff" }} aria-labelledby="privacy-contact">
          <h2 id="privacy-contact" className="text-lg font-bold" style={{ fontFamily: DISPLAY_FONT }}>Questions or deletion requests</h2>
          <p className="mt-2 text-sm" style={{ color: INK }}>
            {config.contactEmail
              ? <>Email <a className="font-semibold underline" href={`mailto:${config.contactEmail}`} style={{ color: GREEN }}>{config.contactEmail}</a>. Include your Player ID from Profile.</>
              : "Contact the PicklePro project team. Include your Player ID from Profile."}
          </p>
        </section>
        <p className="text-center text-xs" style={{ color: WHITE_SUB }}>PicklePro research prototype · DLSU CAPIT-01</p>
      </main>
    </div>
  );
}
