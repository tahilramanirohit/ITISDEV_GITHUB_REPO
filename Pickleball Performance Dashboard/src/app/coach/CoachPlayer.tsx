import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { CoachSpeech, flattenScript, unlockSpeech, type TimingMode } from "../../lib/coaching/coachSpeech";
import { formatSeconds, scriptSeconds, type CoachScript } from "../../lib/coaching/coachScript";
import { MASCOT_NAME } from "../brand";
import { Coach } from "../shell/Coach";
// The player is a full-screen brand surface: paper text and the on-brand tints.
import { DEEP, HERO, ON_BRAND, ON_BRAND_MUTED, ON_BRAND_PICKLE, ON_BRAND_TINT, YELLOW, YELLOW_INK } from "../theme";

const SPEEDS = [0.75, 1, 1.25];
const REST_MOUTH = 0.12;   // nearly closed: Piko's resting smile
const FULL_TEXT_KEY = "picklepro.coach.fullText";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function readFullText(): boolean {
  try { return localStorage.getItem(FULL_TEXT_KEY) === "1"; } catch { return false; }
}
function saveFullText(on: boolean) {
  try { localStorage.setItem(FULL_TEXT_KEY, on ? "1" : "0"); } catch { /* storage blocked: keep the choice for this visit only */ }
}

/** Piko's mouth, in the coach head's own coordinates (the smile spans x 49 to 71 at y 106). */
function mouthPath(open: number) {
  const h = 3 + open * 13, y = 105;
  return `M49 ${y} C53 ${y + 1.5} 67 ${y + 1.5} 71 ${y} C70 ${y + h * 0.9} 66 ${y + h} 60 ${y + h} C54 ${y + h} 50 ${y + h * 0.9} 49 ${y} Z`;
}

type Talk = { id: number; word: string };

/** Piko, opening its mouth once per rough syllable of each spoken word. */
function TalkingPickle({ talk, speaking, rate }: { talk: Talk; speaking: boolean; rate: number }) {
  const mouth = useRef<SVGPathElement>(null);
  const anim = useRef({ open: REST_MOUTH, target: REST_MOUTH, raf: 0, timers: [] as ReturnType<typeof setTimeout>[] });

  const draw = useCallback(() => {
    const { open } = anim.current;
    mouth.current?.setAttribute("d", mouthPath(open));
  }, []);
  const moveTo = useCallback((target: number) => {
    const a = anim.current;
    a.target = target;
    const tick = () => {
      a.open += (a.target - a.open) * 0.42;
      draw();
      a.raf = Math.abs(a.target - a.open) > 0.005 ? requestAnimationFrame(tick) : 0;
    };
    if (!a.raf) a.raf = requestAnimationFrame(tick);
  }, [draw]);
  const clearTimers = () => { anim.current.timers.forEach(clearTimeout); anim.current.timers = []; };

  useEffect(() => {
    draw();
    const a = anim.current;
    return () => { cancelAnimationFrame(a.raf); a.timers.forEach(clearTimeout); };
  }, [draw]);

  useEffect(() => {
    if (talk.id === 0 || reducedMotion()) return;
    clearTimers();
    if (!talk.word) return moveTo(0.12);
    const syllables = Math.min(3, Math.max(1, Math.round(talk.word.replace(/[^a-z]/gi, "").length / 4)));
    const step = 150 / rate;
    for (let i = 0; i < syllables; i++) {
      anim.current.timers.push(setTimeout(() => moveTo(0.55 + Math.random() * 0.45), i * step));
      anim.current.timers.push(setTimeout(() => moveTo(0.12), i * step + step * 0.55));
    }
  }, [talk, rate, moveTo]);

  useEffect(() => { if (!speaking) { clearTimers(); moveTo(REST_MOUTH); } }, [speaking, moveTo]);

  return (
    // Piko's icon, with a paper ring so the forest square reads on the forest player.
    <div className="coach-pickle grid aspect-square h-[clamp(104px,16vh,160px)] shrink-0 place-items-center lg:h-[min(36vh,320px)]"
      style={{ transformOrigin: "50% 100%", opacity: speaking ? 1 : 0.96 }} aria-hidden="true">
      <Coach size={320} className="h-full w-full rounded-[22.5%] ring-2 ring-[rgba(250,246,234,0.35)]" mouth={<path ref={mouth} fill="#0B2A1A" stroke="none" />} />
    </div>
  );
}

type WakeLock = { release: () => Promise<void> };

/**
 * Full-screen audio coach. Words appear only after the voice has said them ("Word by word"),
 * or the whole script can be shown at once ("Full text") for anyone who would rather read.
 */
export function CoachPlayer({ script, isShort, onFull, onClose }: {
  script: CoachScript; isShort: boolean; onFull?: () => void; onClose: () => void;
}) {
  const sentences = useMemo(() => flattenScript(script), [script]);
  const [pos, setPos] = useState({ s: 0, w: -1 });
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [timing, setTiming] = useState<TimingMode | null>(null);
  const [rate, setRate] = useState(1);
  const [fullText, setFullText] = useState(readFullText);
  const [talk, setTalk] = useState<Talk>({ id: 0, word: "" });
  const lyrics = useRef<HTMLDivElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);

  const engine = useRef<CoachSpeech | null>(null);
  if (!engine.current) {
    engine.current = new CoachSpeech(sentences, {
      onWord: (s, w) => { setPos({ s, w }); setTalk((t) => ({ id: t.id + 1, word: sentences[s].words[w].text })); },
      onSentenceEnd: (s) => { setPos({ s, w: sentences[s].words.length - 1 }); setTalk((t) => ({ id: t.id + 1, word: "" })); },
      onTiming: setTiming,
      onFinish: () => { setDone(true); setPlaying(false); },
    });
  }

  const playFrom = useCallback((s: number) => {
    setDone(false);
    setPos({ s, w: -1 });
    setPlaying(true);
    engine.current?.play(s);
  }, []);
  const pause = useCallback(() => {
    engine.current?.stop();
    setPlaying(false);
    // The current sentence restarts on resume, so its words are hidden again until spoken.
    setPos((p) => ({ s: p.s, w: -1 }));
  }, []);

  // Opened from a tap (see CoachLauncher), so speech is allowed to start straight away.
  useEffect(() => {
    const e = engine.current;
    playFrom(0);
    playButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { e?.stop(); document.body.style.overflow = overflow; };
  }, [playFrom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVisibility); };
  }, [onClose, pause]);

  // Best effort: ask the phone to keep the screen on while the coach talks.
  useEffect(() => {
    if (!playing) return;
    let lock: WakeLock | null = null;
    let cancelled = false;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock?.request("screen")
      .then((l) => { if (cancelled) void l.release().catch(() => {}); else lock = l; }).catch(() => {});
    return () => { cancelled = true; void lock?.release().catch(() => {}); };
  }, [playing]);

  // Keep the newest spoken word in view.
  useEffect(() => {
    const box = lyrics.current;
    const target = box?.querySelector<HTMLElement>("[data-now]");
    if (!box || !target) return;
    const want = target.getBoundingClientRect().bottom - box.getBoundingClientRect().top - box.clientHeight * 0.6;
    if (want > 6 || (fullText && want < -box.clientHeight * 0.4)) box.scrollBy({ top: want, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [pos, fullText]);

  useEffect(() => {
    if (done) lyrics.current?.scrollTo({ top: lyrics.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [done]);

  const current = sentences[Math.min(pos.s, sentences.length - 1)];
  const sectionIndex = current?.section ?? 0;
  const section = script.sections[sectionIndex];
  const firstSource = section?.lines.find((l) => l.source)?.source;
  const said = (i: number, w: number) => done || i < pos.s || (i === pos.s && w <= pos.w);
  const shown = (i: number) => done || fullText || i < pos.s || (i === pos.s && pos.w >= 0);

  function next() {
    const n = sentences.findIndex((s) => s.section === sectionIndex + 1);
    if (n < 0) { engine.current?.stop(); setPlaying(false); setDone(true); } else playFrom(n);
  }
  function changeSpeed() {
    const r = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(r);
    if (engine.current) engine.current.rate = r;
    if (playing) playFrom(pos.s);
  }
  function setTextMode(on: boolean) { setFullText(on); saveFullText(on); }

  const timingLabel = timing === "exact" ? "Words in sync with the voice" : timing === "estimated" ? "Words follow the voice (estimated)"
    : timing === "text" ? "No voice on this device: reading mode" : "";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Audio coaching" className={`fixed inset-0 z-50 ${playing ? "coach-speaking" : ""}`}
      style={{ background: HERO, color: ON_BRAND, paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="grid h-full grid-rows-[auto_1fr_auto] px-4 pt-3 sm:px-8 lg:px-14">
        <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Close coaching" className="grid h-11 w-11 place-items-center rounded-full" style={{ background: ON_BRAND_TINT }}><X size={22} aria-hidden="true" /></button>
          <div className="flex gap-1" role="group" aria-label="Parts">
            {script.sections.map((sec, si) => {
              const idx = sentences.map((s, i) => [s, i] as const).filter(([s]) => s.section === si).map(([, i]) => i);
              const doneCount = done ? idx.length : idx.filter((i) => i < pos.s).length + (idx.includes(pos.s) && pos.w >= 0 ? 0.5 : 0);
              return <button key={si} type="button" aria-label={`Jump to ${sec.title}`} onClick={() => playFrom(idx[0])} className="relative h-7 flex-1">
                <span className="absolute inset-x-0 top-3 h-1 rounded" style={{ background: "rgba(250,246,234,0.18)" }} />
                <span className="absolute left-0 top-3 h-1 rounded transition-[width] duration-200" style={{ background: ON_BRAND_PICKLE, width: `${(doneCount / Math.max(1, idx.length)) * 100}%` }} />
              </button>;
            })}
          </div>
          <span />
        </div>

        <div className="grid min-h-0 grid-rows-[auto_1fr] lg:grid-cols-[minmax(280px,36%)_1fr] lg:grid-rows-1 lg:gap-12">
          <div className="flex items-center gap-4 border-b py-3 lg:flex-col lg:justify-center lg:border-b-0 lg:pb-[4vh] lg:text-center" style={{ borderColor: "rgba(250,246,234,0.12)" }}>
            <TalkingPickle talk={talk} speaking={playing} rate={rate} />
            <div className="grid min-w-0 gap-1 lg:mt-4 lg:justify-items-center">
              <span className="flex items-center type-label" style={{ color: ON_BRAND_PICKLE }}>
                {done ? "All done" : section?.eyebrow ?? `Part ${sectionIndex + 1} of ${script.sections.length}`}
                <span className="coach-wave ml-2 inline-flex h-3.5 items-end gap-[3px]" style={{ color: YELLOW }} aria-hidden="true"><i /><i /><i /><i /></span>
              </span>
              <h2 className="type-display-lg">{done ? "Finished" : section?.title}</h2>
              <p className="text-sm font-bold" style={{ color: ON_BRAND_MUTED }}>
                {done ? "Replay, or close to read your plan" : firstSource === "video" ? `${MASCOT_NAME}, from your video` : firstSource === "rating" ? `${MASCOT_NAME}, from your ratings` : `${MASCOT_NAME}, your coach`}
              </p>
            </div>
          </div>

          <div className="relative min-h-0">
            <div ref={lyrics} className="coach-lyrics absolute inset-0 overflow-y-auto pb-[45%] pt-5 lg:pt-[6vh]">
              {script.sections.map((sec, si) => {
                const items = sentences.map((s, i) => ({ s, i })).filter(({ s }) => s.section === si);
                if (!items.some(({ i }) => shown(i))) return null;
                return <section key={si} className="mb-7">
                  <h3 className="mb-3 flex items-center gap-2.5 type-label" style={{ color: ON_BRAND_MUTED }}>
                    {sec.title}<span className="h-px flex-1" style={{ background: "rgba(250,246,234,0.12)" }} />
                  </h3>
                  {items.filter(({ i }) => shown(i)).map(({ s, i }, k, arr) => {
                    const isCurrent = !done && i === pos.s;
                    const showTag = s.source && (k === 0 || arr[k - 1].s.source !== s.source);
                    return <p key={i} data-now={isCurrent && pos.w < 0 ? "" : undefined}
                      className="mb-4 max-w-[30ch] text-[clamp(22px,5.6vw,34px)] font-bold leading-[1.3] transition-colors duration-300 lg:text-[clamp(28px,2.8vw,42px)]"
                      style={{ color: isCurrent ? ON_BRAND : "rgba(250,246,234,0.42)" }}>
                      {showTag && <span className="mb-2 block w-fit rounded-full px-2.5 py-1 type-label"
                        style={{ background: ON_BRAND_TINT, color: s.source === "video" ? ON_BRAND : ON_BRAND_PICKLE }}>
                        {s.source === "video" ? "From your video" : "From your ratings"}</span>}
                      {s.words.map((word, w) => said(i, w)
                        ? <span key={w}><span className="coach-word" data-now={isCurrent && w === pos.w ? "" : undefined}
                            style={isCurrent && w === pos.w && playing ? { color: YELLOW } : undefined}>{word.text}</span> </span>
                        : fullText ? <span key={w} style={{ color: "rgba(250,246,234,0.22)" }}>{word.text} </span> : null)}
                    </p>;
                  })}
                </section>;
              })}
              {done && <div className="mt-2 grid max-w-[520px] gap-3 rounded-[var(--radius-lg)] p-4 text-[15px] font-bold" style={{ background: ON_BRAND_TINT, color: ON_BRAND }}>
                <span>That's your {isShort ? "short" : "full"} coaching. Everything from it is above.</span>
                <span className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => playFrom(0)} className="min-h-[48px] rounded-[var(--radius-md)] px-5 font-bold" style={{ background: YELLOW, color: YELLOW_INK }}>Replay</button>
                  {isShort && onFull && <button type="button" onClick={onFull} className="min-h-[48px] rounded-[var(--radius-md)] px-5 font-bold" style={{ background: ON_BRAND_TINT }}>Hear full plan</button>}
                  <button type="button" onClick={onClose} className="min-h-[48px] rounded-[var(--radius-md)] px-5 font-bold" style={{ background: ON_BRAND_TINT }}>Close</button>
                </span>
              </div>}
            </div>
          </div>
        </div>

        <div className="-mx-4 grid gap-3 border-t px-4 pt-3 sm:-mx-8 sm:px-8 lg:-mx-14 lg:px-14"
          style={{ borderColor: "rgba(250,246,234,0.12)", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="mx-auto grid w-full max-w-[560px] grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-3.5">
            <button type="button" onClick={changeSpeed} aria-label={`Speaking speed ${rate}x`} className="h-11 min-w-[52px] justify-self-start rounded-full px-3 text-sm font-bold tabular-nums" style={{ border: "1px solid rgba(250,246,234,0.25)" }}>{rate}×</button>
            <button type="button" onClick={() => playFrom(Math.max(0, Math.min(pos.s, sentences.length) - 1))} aria-label="Back one sentence" className="grid h-[50px] w-[50px] place-items-center rounded-full" style={{ background: ON_BRAND_TINT }}><SkipBack size={22} fill="currentColor" /></button>
            <button ref={playButton} type="button" onClick={() => (playing ? pause() : playFrom(done ? 0 : pos.s))} aria-label={playing ? "Pause" : done ? "Replay" : "Play"}
              className="grid h-[72px] w-[72px] place-items-center rounded-full" style={{ background: YELLOW, color: YELLOW_INK }}>
              {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
            </button>
            <button type="button" onClick={next} aria-label="Skip to next part" className="grid h-[50px] w-[50px] place-items-center rounded-full" style={{ background: ON_BRAND_TINT }}><SkipForward size={22} fill="currentColor" /></button>
            <span />
          </div>
          <div className="mx-auto flex rounded-full p-1" role="group" aria-label="How to show the words" style={{ background: ON_BRAND_TINT }}>
            {([[false, "Word by word"], [true, "Full text"]] as const).map(([value, label]) => (
              <button key={label} type="button" aria-pressed={fullText === value} onClick={() => setTextMode(value)}
                className="min-h-[40px] rounded-full px-4 text-sm font-bold" style={fullText === value ? { background: ON_BRAND, color: DEEP } : { color: ON_BRAND_MUTED }}>{label}</button>
            ))}
          </div>
          {timingLabel && <p className="text-center text-xs" style={{ color: ON_BRAND_MUTED }}>{timingLabel}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Opt-in buttons for the audio coach. The written plan on the page is unchanged; nothing plays until tapped.
 * `tone` matches the surface the buttons sit on.
 */
export function CoachLauncher({ shortScript, fullScript, tone = "yellow", compact = false, label }: {
  shortScript: CoachScript; fullScript?: CoachScript; tone?: "yellow" | "light" | "brand"; compact?: boolean; label?: string;
}) {
  const [open, setOpen] = useState<"short" | "full" | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const shortLen = formatSeconds(scriptSeconds(shortScript));
  const fullLen = fullScript ? formatSeconds(scriptSeconds(fullScript)) : "";
  const start = (length: "short" | "full") => { unlockSpeech(); setOpen(length); };
  const close = useCallback(() => { setOpen(null); opener.current?.focus(); }, []);
  const hasFull = !!fullScript && fullLen !== shortLen;

  return (
    <div className="flex flex-wrap gap-2">
      <button ref={opener} type="button" onClick={() => start("short")}
        className={`inline-flex items-center gap-2 rounded-[var(--radius-md)] font-bold ${compact ? "min-h-[44px] px-4 text-sm" : "min-h-[48px] px-5 text-sm"}`}
        style={tone === "yellow" ? { background: YELLOW, color: YELLOW_INK }
          : tone === "brand" ? { color: ON_BRAND, border: "1px solid rgba(250,246,234,0.35)" }
          : { background: "var(--surface-raised)", color: "var(--ink)", border: "1px solid var(--line)" }}>
        <Play size={compact ? 14 : 16} fill="currentColor" aria-hidden="true" />
        {label ?? (compact ? "Hear this week's plan" : "Play coaching")} · {shortLen}
      </button>
      {hasFull && !compact && <button type="button" onClick={() => start("full")} className="min-h-[48px] rounded-[var(--radius-md)] px-4 text-sm font-bold"
        style={tone === "yellow" ? { border: "1px solid rgba(250,246,234,0.35)", color: "#FAF6EA" } : { color: "var(--pickle-ink)" }}>
        Hear full plan · {fullLen}
      </button>}
      {open && <CoachPlayer key={open} script={open === "short" ? shortScript : fullScript!} isShort={open === "short"}
        onFull={hasFull ? () => { unlockSpeech(); setOpen("full"); } : undefined} onClose={close} />}
    </div>
  );
}
