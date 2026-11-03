import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ACCENT, ACCENT_INK, ACTION, CHECK, CREAM, INK, INK_2, INK_3, LINE, ON_ACTION, ON_CHECK, ON_CREAM, SURFACE_2, TABBAR,
} from "../theme";
import { cardStyle, mascotUrl, numStyle, pressable } from "../shell/primitives";

// A made-up player, Sam, so the example is never mistaken for the viewer's own games.
const TREND = [2.6, 2.6, 2.9, 3.0, 3.2, 3.3, 3.5, 3.5];
const SKILLS: [string, number, number][] = [
  ["Serve", 3.0, 4.0], ["Dinking", 2.0, 3.5], ["Return of serve", 2.5, 3.0], ["Third-shot drop", 2.0, 2.0],
];
type Who = "sam" | "jo" | "rafa" | "alec";
const PEOPLE: Record<Who, { name: string; ini: string; team: "us" | "them" }> = {
  sam: { name: "Sam", ini: "SA", team: "us" }, jo: { name: "Jo", ini: "JO", team: "us" },
  rafa: { name: "Rafa", ini: "RA", team: "them" }, alec: { name: "Alec", ini: "AL", team: "them" },
};
const SHOTS: { t: string; who: Who; text: string }[] = [
  { t: "0:00", who: "rafa", text: "Serve, deep to the backhand" },
  { t: "0:03", who: "sam", text: "Return, deep cross-court" },
  { t: "0:06", who: "alec", text: "Third-shot drive" },
  { t: "0:10", who: "sam", text: "Volley" },
  { t: "0:12", who: "rafa", text: "Dink to the middle" },
  { t: "0:15", who: "sam", text: "Drop, into the net" },
  { t: "0:21", who: "jo", text: "Serve" },
  { t: "0:33", who: "sam", text: "Dink, 4 in a row" },
  { t: "0:49", who: "jo", text: "Overhead, winner" },
];

function Tip({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div role="note" className="pp-rise flex items-center gap-2 rounded-[18px] py-2.5 pl-2 pr-3" style={{ background: CREAM, color: ON_CREAM }}>
      <img src={mascotUrl} alt="" aria-hidden="true" className="h-14 w-11 shrink-0 object-contain" />
      <div className="text-[13px] leading-snug">{children}<p className="mt-1 text-[11px] font-semibold" style={{ color: "#5d665f" }}>Example tip {n} of 2</p></div>
    </div>
  );
}

/** A sample game, clearly framed and labelled, so new players see what their screens will become. */
export default function ExamplePage() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>("0:10");
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  const w = 150, h = 64, lo = 2.4, hi = 3.7;
  const pts = TREND.map((v, i) => `${(i / (TREND.length - 1)) * w},${h - ((v - lo) / (hi - lo)) * h}`).join(" ");

  return (
    <div className="relative space-y-4">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[35] rounded-[0px] border-[3px]" style={{ borderColor: CREAM }} />
      <div role="status" className="sticky top-[calc(env(safe-area-inset-top)+68px)] z-[36] flex h-11 items-center gap-2 rounded-full pl-2 pr-1 shadow-lg desktop:top-4"
        style={{ background: CREAM, color: ON_CREAM }}>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wider" style={{ background: "#16271e", color: ACTION }}>EXAMPLE</span>
        <span className="truncate text-[13px] font-bold">Sample game, not yours</span>
        <button type="button" onClick={close} className={`ml-auto min-h-[36px] rounded-full px-3.5 text-xs font-extrabold ${pressable}`} style={{ background: "#16271e", color: "#f2f5f1" }}>Close</button>
      </div>

      <h1 className="text-[1.75rem] font-extrabold leading-tight">Sam's progress</h1>

      <section aria-label="Average self rating" className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-[18px] p-4" style={cardStyle}>
        <div>
          <p className="text-xs" style={{ color: INK_3 }}>Average self rating</p>
          <p className="text-[56px] leading-[0.95]" style={numStyle}>3.5</p>
          <p className="mt-1 text-[13px] font-bold" style={{ color: ACCENT_INK }}>Up from 2.6 in 8 games</p>
        </div>
        <svg width={w} height={h} viewBox={`-6 -6 ${w + 12} ${h + 12}`} aria-hidden="true">
          <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </section>

      <section aria-label="Where Sam stood" className="grid grid-cols-[110px_1fr] gap-3.5 rounded-[18px] p-4" style={cardStyle}>
        <svg viewBox="0 0 128 220" width="110" height="190" role="img" aria-label="Court map: Sam spent most of the game at the kitchen line, on the left">
          <rect x="4" y="4" width="120" height="212" rx="4" fill="#2f5d8a" /><rect x="4" y="80" width="120" height="60" fill="#3b6f9e" />
          <circle cx="40" cy="150" r="26" fill={ACTION} opacity=".35" /><circle cx="38" cy="148" r="15" fill={ACTION} opacity=".6" /><circle cx="36" cy="147" r="7" fill="#fff3c4" />
          <circle cx="44" cy="186" r="14" fill={ACTION} opacity=".35" />
          <g fill="none" stroke="#fff" strokeWidth="2"><rect x="4" y="4" width="120" height="212" rx="4" /><path d="M4 80h120M4 140h120M64 4v76M64 140v76" /></g>
          <line x1="0" y1="110" x2="128" y2="110" stroke="#0e1a13" strokeWidth="4" />
        </svg>
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-extrabold">Where Sam stood</h2>
          {[["58%", "at the kitchen", true], ["21%", "in transition", false], ["81%", "on the left half", false]].map(([v, l, hl]) => (
            <div key={l as string}><p className="text-[28px] leading-none" style={{ ...numStyle, color: hl ? ACCENT_INK : INK }}>{v}</p><p className="text-xs" style={{ color: INK_2 }}>{l}</p></div>
          ))}
        </div>
      </section>
      <Tip n={1}><b>This is a real game's court map.</b> Yellow is where Sam spent most of the game. Yours fills in after your first video.</Tip>

      <section aria-label="By skill">
        <div className="grid grid-cols-[1fr_44px_48px] gap-2 pb-1.5 text-xs" style={{ color: INK_3 }}>
          <span className="font-bold" style={{ color: INK_2 }}>By skill</span><span className="text-right">first</span><span className="text-right">now</span>
        </div>
        <ul className="border-b" style={{ borderColor: LINE }}>
          {SKILLS.map(([label, a, b]) => (
            <li key={label} className="grid min-h-[44px] grid-cols-[1fr_44px_48px] items-center gap-2 border-t text-sm" style={{ borderColor: LINE }}>
              <span>{label}</span>
              <span className="text-right text-[15px]" style={{ ...numStyle, fontWeight: 700, color: INK_3 }}>{a.toFixed(1)}</span>
              <span className="text-right text-base" style={{ ...numStyle, color: b > a ? ACCENT_INK : INK }}>{b.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Sam's shots" className="rounded-[18px] p-4" style={cardStyle}>
        <h2 className="text-lg font-extrabold">Shots from Sam's video</h2>
        <p className="mt-0.5 text-[13px]" style={{ color: INK_2 }}>Sam's team on the right, the other team on the left.</p>
        <ol className="mt-3 flex flex-col gap-2">
          <li className="self-center rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: TABBAR, border: `1px solid ${LINE}`, color: INK_3 }}>Rally 1 · 0:00</li>
          {SHOTS.map((s) => {
            const p = PEOPLE[s.who];
            const right = p.team === "us";
            const look = s.who === "sam" ? { background: ACTION, color: ON_ACTION } : s.who === "jo" ? { background: "color-mix(in srgb, var(--pp-green) 22%, var(--pp-surface))", color: INK } : { background: SURFACE_2, color: INK };
            const av = s.who === "sam" ? { background: ACTION, color: ON_ACTION } : s.who === "jo" ? { background: CHECK, color: ON_CHECK } : { background: LINE, color: INK_2 };
            return (
              <li key={s.t} className={`flex ${right ? "justify-end" : "justify-start"}`}>
                <button type="button" onClick={() => setPicked(s.t)} aria-pressed={picked === s.t}
                  className={`flex max-w-[86%] items-end gap-1.5 text-left ${right ? "flex-row-reverse" : ""} transition-transform active:scale-[0.97] motion-reduce:transition-none`}>
                  <span aria-hidden="true" className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold" style={av}>{p.ini}</span>
                  <span className={`block px-3 py-1.5 ${right ? "rounded-[16px] rounded-br-[4px]" : "rounded-[16px] rounded-bl-[4px]"}`}
                    style={{ ...look, boxShadow: picked === s.t ? `0 0 0 2px ${INK}` : "none" }}>
                    <span className="block text-[11px] font-semibold" style={{ opacity: 0.75 }}>{p.name} · <span style={{ ...numStyle, fontWeight: 700, fontSize: 13 }}>{s.t}</span></span>
                    <span className="block text-[13px] font-bold">{s.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <Tip n={2}><b>Every bubble is a shot.</b> On your own videos, tap one to jump the video to that moment.</Tip>

      <p className="text-center text-xs" style={{ color: INK_3 }}>Nothing on this page counts toward your stats.</p>
      <button type="button" onClick={() => navigate("/new?mode=self")} className={`flex min-h-[52px] w-full items-center justify-center rounded-full text-base font-extrabold ${pressable}`}
        style={{ background: ACTION, color: ON_ACTION }}>Log your own game</button>
    </div>
  );
}
