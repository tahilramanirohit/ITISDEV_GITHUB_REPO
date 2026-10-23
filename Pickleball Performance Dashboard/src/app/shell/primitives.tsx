import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import mascotUrl from "../../assets/pickle-mascot.webp";
import mascot2xUrl from "../../assets/pickle-mascot@2x.webp";
import {
  ACCENT, ACCENT_INK, ACCENT_SOFT, ACTION, ACTION_EDGE, DANGER, DISPLAY_FONT, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, ON_HERO,
  ON_STRONG, STRONG, SURFACE, SURFACE_2, VIOLET, WARN, alpha,
} from "../theme";

export { mascotUrl, mascot2xUrl };

// One radius scale for the whole app: controls 12px, cards 14px, chips 10px.
// Cards separate by a hairline border, never by a soft shadow.

/** Shared interaction states, so every button presses and focuses the same way. */
export const pressable = "transition-[filter,transform] duration-100 hover:brightness-[0.96] active:brightness-[0.92] disabled:opacity-50 disabled:pointer-events-none";

/** Card surface: hairline border, one radius, no shadow. */
export const cardStyle = { background: SURFACE, border: `1px solid ${LINE}`, color: INK } as const;

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`rounded-[14px] p-5 ${className}`} style={cardStyle}>
      {children}
    </div>
  );
}

// ── Section Banner ────────────────────────────────────────────────────────
export function SectionBanner({ n, eyebrow, title, subtitle, badge }: {
  n: string; eyebrow: string; title: string; subtitle: string; bg?: string; accent?: string; badge?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-4 rounded-[14px] px-5 py-4" style={cardStyle}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-lg font-extrabold"
        style={{ background: STRONG, color: ON_STRONG, fontFamily: DISPLAY_FONT }}>{n}</div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mb-0.5 text-sm font-semibold" style={{ color: ACCENT_INK }}>{eyebrow}</div>
          {badge && <Pill color={WARN}>{badge}</Pill>}
        </div>
        <div className="text-lg font-bold" style={{ fontFamily: DISPLAY_FONT, color: INK }}>{title}</div>
        <div className="mt-0.5 text-sm" style={{ color: INK_2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Widget Header ─────────────────────────────────────────────────────────
export function WidgetHeader({ title, subtitle, level = "h3" }: { title: string; subtitle: string; accent?: string; level?: "h1" | "h2" | "h3" }) {
  const Heading = level;
  return (
    <div className="mb-4">
      <Heading className="mb-0.5 text-lg font-bold" style={{ fontFamily: DISPLAY_FONT, color: INK }}>{title}</Heading>
      <p className="text-sm" style={{ color: INK_2 }}>{subtitle}</p>
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────
export function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: any[]; label?: string; suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] px-3 py-2 text-sm" style={{ ...cardStyle, borderColor: LINE_STRONG }}>
      {label && <div className="mb-1.5 font-bold" style={{ color: INK }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: p.color ?? ACCENT }} />
          <span style={{ color: INK_2 }}>{p.name}:</span>
          <span className="font-bold tabular-nums" style={{ color: INK }}>{typeof p.value === "number" ? `${p.value.toFixed(p.value < 10 ? 1 : 0)}${suffix}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Small labelled chip ───────────────────────────────────────────────────
export function Pill({ children, color = VIOLET, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ background: alpha(color, 12), color, border: `1px solid ${alpha(color, 30)}` }}>
      {children}
    </span>
  );
}

/** A tappable choice chip, used for single and multiple selection. */
export function Chip({ selected, children, onClick, label }: { selected: boolean; children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-pressed={selected} aria-label={label} onClick={onClick}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-4 py-2 text-sm font-semibold ${pressable}`}
      style={selected
        ? { background: STRONG, color: ON_STRONG, border: `1px solid ${STRONG}` }
        : { background: SURFACE, color: INK, border: `1px solid ${LINE}` }}>
      {children}
    </button>
  );
}

/**
 * Full-width action, sized for thumbs. "optic" is the one lime action per screen
 * (log a game, save a rating); "dark" is the ordinary primary; "light" is secondary.
 */
export function PrimaryButton({ children, className = "", tone = "dark", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "dark" | "optic" | "light" }) {
  const style = tone === "optic" ? { background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }
    : tone === "light" ? { background: SURFACE, color: INK, border: `1px solid ${LINE_STRONG}` }
    : { background: STRONG, color: ON_STRONG, border: `1px solid ${STRONG}` };
  return (
    <button {...rest}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-[0.95rem] font-bold ${pressable} ${className}`}
      style={{ ...style, ...rest.style }}>
      {children}
    </button>
  );
}

/** Moves focus among a group with the arrow keys, Home and End (W3C APG tabs and radio patterns). */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Props for the panel a SegmentedTabs tab controls. */
export function tabPanelProps(idBase: string, value: string) {
  return { role: "tabpanel", id: `${idBase}-panel-${value}`, "aria-labelledby": `${idBase}-tab-${value}`, tabIndex: 0 } as const;
}

/**
 * Underline tabs for switching between views of one screen. Follows the
 * W3C tabs pattern: one tab stop, arrow keys move and select, panels linked.
 */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, label, idBase = "tabs" }: {
  tabs: { value: T; label: string; badge?: string }[]; value: T; onChange: (v: T) => void; label: string; idBase?: string;
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].value);
    document.getElementById(`${idBase}-tab-${tabs[next].value}`)?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 overflow-x-auto border-b sm:gap-6" style={{ borderColor: LINE }}>
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button key={tab.value} type="button" role="tab" id={`${idBase}-tab-${tab.value}`} aria-controls={`${idBase}-panel-${tab.value}`}
            aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(tab.value)} onKeyDown={(e) => onKeyDown(e, index)}
            className="-mb-px min-h-[44px] shrink-0 whitespace-nowrap border-b-[3px] px-0.5 py-2 text-sm font-semibold transition-colors"
            style={active ? { color: INK, borderColor: ACCENT } : { color: INK_2, borderColor: "transparent" }}>
            {tab.label}
            {tab.badge && <span className="ml-1.5 text-xs font-semibold" style={{ color: INK_3 }}>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Screen header: a short context line, the heading, and an optional mascot beside it.
 * Sits directly on the page, with no colored band behind it.
 */
export function PageHero({ eyebrow, title, subtitle, mascot = false, action, children }: {
  eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; mascot?: boolean; action?: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="pb-5" style={{ color: INK }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="text-sm" style={{ color: INK_3 }}>{eyebrow}</p>}
          <h1 className="mt-1 text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.02em] md:text-4xl" style={{ fontFamily: DISPLAY_FONT }}>{title}</h1>
          {subtitle && <div className="mt-1.5 text-[0.95rem] leading-relaxed" style={{ color: INK_2 }}>{subtitle}</div>}
        </div>
        {action}
        {mascot && <img src={mascotUrl} srcSet={`${mascotUrl} 1x, ${mascot2xUrl} 2x`} alt="" aria-hidden="true"
          className="pointer-events-none h-24 w-auto shrink-0 md:h-28" />}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** Content that follows a PageHero. Kept as a plain wrapper so screens can group their sections. */
export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

/** A thin progress bar for headers. */
export function HeroProgress({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: SURFACE_2 }} role="progressbar"
      aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: ACCENT }} />
    </div>
  );
}

/** Progress ring tile: label, big value and a ring. */
export function RingTile({ label, value, fraction, color = ACCENT }: { label: string; value: string; fraction: number; color?: string }) {
  const p = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div className="flex items-center justify-between gap-2 rounded-[14px] p-3.5" style={cardStyle}>
      <div className="min-w-0">
        <p className="text-[13px]" style={{ color: INK_3 }}>{label}</p>
        {/* Words (like a level name) wrap at a smaller size instead of overflowing the tile. */}
        <p className={`${value.length > 6 ? "text-base leading-tight" : "text-[1.6rem] leading-tight"} font-extrabold tabular-nums`}
          style={{ color: INK, fontFamily: DISPLAY_FONT }}>{value}</p>
      </div>
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${p}%, ${SURFACE_2} 0)` }}>
        <span className="h-8 w-8 rounded-full" style={{ background: SURFACE }} />
      </span>
    </div>
  );
}

/** Screen title row used at the top of each tab. */
export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] md:text-3xl" style={{ fontFamily: DISPLAY_FONT, color: INK }}>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm" style={{ color: INK_2 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold" style={{ fontFamily: DISPLAY_FONT, color: INK }}>{children}</h2>
      {action}
    </div>
  );
}

export function Notice({ tone = "info", onDark = false, children }: { tone?: "info" | "warn" | "error"; onDark?: boolean; children: ReactNode }) {
  const color = tone === "error" ? DANGER : tone === "warn" ? WARN : ACCENT_INK;
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className="rounded-[12px] px-4 py-3 text-sm leading-relaxed"
      style={onDark
        ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.24)", color: ON_HERO }
        : { background: tone === "info" ? ACCENT_SOFT : alpha(color, 8), border: `1px solid ${alpha(color, 30)}`, color: tone === "info" ? INK : color }}>
      {children}
    </div>
  );
}

// ── Brand mark ────────────────────────────────────────────────────────────
/** The pickle on its own, for narrow spaces such as the tablet rail. */
export function PickleProMark({ size = 40 }: { size?: number }) {
  return (
    <img src={mascotUrl} srcSet={`${mascotUrl} 1x, ${mascot2xUrl} 2x`} alt="" aria-hidden
      style={{ height: size, width: "auto" }} />
  );
}

export function PickleProLogo({ size = "md", tone = "light" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  const height = size === "lg" ? 60 : size === "sm" ? 40 : 48;
  const onHero = tone === "dark";
  return (
    <div className="flex items-center gap-2">
      <img src={mascotUrl} srcSet={`${mascotUrl} 1x, ${mascot2xUrl} 2x`} alt="" aria-hidden className="flex-shrink-0" style={{ height, width: "auto" }} />
      <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: size === "lg" ? "1.9rem" : size === "sm" ? "1.25rem" : "1.55rem",
        letterSpacing: "-0.01em", lineHeight: 1, color: onHero ? ON_HERO : INK }}>
        PicklePro
      </span>
    </div>
  );
}

export const fieldStyle = {
  background: SURFACE,
  border: `1px solid ${LINE_STRONG}`,
  color: INK,
} as const;

export const labelClass = "block text-sm font-semibold mb-1.5";
export const labelStyle = { color: INK } as const;
export const subtleText = { color: INK_3 } as const;

/** Password field with a show/hide button, so people can check what they typed on a phone keyboard. */
export function PasswordInput({ className = "", style, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={shown ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        className={`w-full pr-14 ${className}`} style={{ ...fieldStyle, ...style }} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
        className="absolute inset-y-0 right-1 my-auto flex h-11 w-11 items-center justify-center rounded-full" style={{ color: INK_2 }}>
        {shown ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
