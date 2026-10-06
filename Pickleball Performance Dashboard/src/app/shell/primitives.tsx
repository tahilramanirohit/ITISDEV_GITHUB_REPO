import type { ButtonHTMLAttributes, ReactNode } from "react";
import logoUrl from "../../assets/picklepro-logo.webp";
import logo2xUrl from "../../assets/picklepro-logo@2x.webp";
import {
  BORDER, CARD_GLOW, COBALT, DEEP, DEEP_2, DISPLAY_FONT, DOT_BG, GREEN, GREEN_BG, INK, NEON, OPTIC, OPTIC_INK, ORANGE, PICKLE, VIOLET, WHITE, WHITE_DIM, WHITE_SUB, YELLOW,
} from "../theme";

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, className = "", accent }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`rounded-2xl p-5 text-[#16181d] ${className}`}
      style={{ background: WHITE, boxShadow: CARD_GLOW, border: `1px solid ${BORDER}`,
        ...(accent ? { borderTop: `3px solid ${accent}` } : {}) }}>
      {children}
    </div>
  );
}

// ── Section Banner ────────────────────────────────────────────────────────
export function SectionBanner({ n, eyebrow, title, subtitle, bg, accent, badge }: {
  n: string; eyebrow: string; title: string; subtitle: string; bg: string; accent: string; badge?: string;
}) {
  return (
    <div className="rounded-2xl px-5 py-4 mb-5 flex items-start gap-4" style={{ background: bg, border: `1px solid ${accent}40` }}>
      <div className="rounded-2xl w-11 h-11 flex items-center justify-center flex-shrink-0 font-bold text-lg"
        style={{ background: accent, color: WHITE }}>{n}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: accent }}>{eyebrow}</div>
          {badge && <Pill color={ORANGE}>{badge}</Pill>}
        </div>
        <div className="font-bold text-lg text-[#16181d]" style={{ fontFamily: DISPLAY_FONT }}>{title}</div>
        <div className="text-sm mt-0.5" style={{ color: WHITE_DIM }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Widget Header ─────────────────────────────────────────────────────────
export function WidgetHeader({ title, subtitle, accent, level = "h3" }: { title: string; subtitle: string; accent?: string; level?: "h1" | "h2" | "h3" }) {
  const Heading = level;
  return (
    <div className="mb-4">
      <Heading className="font-bold text-lg text-[#16181d] mb-0.5" style={{ fontFamily: DISPLAY_FONT }}>{title}</Heading>
      {accent
        ? <div className="flex items-center gap-1.5 mt-1">
            <div className="h-1 w-4 rounded-full" style={{ background: accent }} />
            <p className="text-sm" style={{ color: WHITE_DIM }}>{subtitle}</p>
          </div>
        : <p className="text-sm" style={{ color: WHITE_DIM }}>{subtitle}</p>
      }
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────
export function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: any[]; label?: string; suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-sm shadow-lg" style={{ background: WHITE, borderColor: BORDER }}>
      {label && <div className="font-bold mb-1.5 text-[#16181d]">{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color ?? GREEN }} />
          <span style={{ color: WHITE_DIM }}>{p.name}:</span>
          <span className="font-bold text-[#16181d]">{typeof p.value === "number" ? `${p.value.toFixed(p.value < 10 ? 1 : 0)}${suffix}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Small labelled chip ───────────────────────────────────────────────────
export function Pill({ children, color = VIOLET, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}40` }}>
      {children}
    </span>
  );
}

/** A tappable choice chip, used for single and multiple selection. */
export function Chip({ selected, children, onClick, label }: { selected: boolean; children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-pressed={selected} aria-label={label} onClick={onClick}
      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors"
      style={selected
        ? { background: DEEP, color: YELLOW, border: `1px solid ${DEEP}` }
        : { background: WHITE, color: INK, border: `1px solid ${BORDER}` }}>
      {children}
    </button>
  );
}

/** Full-width primary action, sized for thumbs. */
export function PrimaryButton({ children, className = "", tone = "dark", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "dark" | "optic" | "light" }) {
  const style = tone === "optic" ? { background: OPTIC, color: OPTIC_INK }
    : tone === "light" ? { background: WHITE, color: INK, border: `1px solid ${BORDER}` }
    : { background: NEON, color: WHITE };
  return (
    <button {...rest}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${className}`}
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
 * Segmented control for switching between views of one screen. Follows the
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
    <div role="tablist" aria-label={label} className="flex gap-4 overflow-x-auto border-b sm:gap-6" style={{ borderColor: BORDER }}>
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button key={tab.value} type="button" role="tab" id={`${idBase}-tab-${tab.value}`} aria-controls={`${idBase}-panel-${tab.value}`}
            aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(tab.value)} onKeyDown={(e) => onKeyDown(e, index)}
            className="-mb-px min-h-[44px] shrink-0 whitespace-nowrap border-b-[3px] px-0.5 py-2 text-sm font-semibold transition-colors"
            style={active ? { color: INK, borderColor: PICKLE } : { color: WHITE_DIM, borderColor: "transparent" }}>
            {tab.label}
            {tab.badge && <span className="ml-1 text-[11px] font-bold uppercase" style={{ color: active ? GREEN : WHITE_SUB }}>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Full-width green page header with an optional pickle, sitting under the content panel. */
export function PageHero({ eyebrow, title, subtitle, mascot = false, action, children }: {
  eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; mascot?: boolean; action?: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="relative -mx-4 -mt-5 overflow-hidden px-4 pb-12 pt-5 md:-mx-6 md:-mt-6 md:px-6 lg:-mx-10 lg:-mt-8 lg:px-10 lg:pt-8"
      style={{ background: `radial-gradient(130% 120% at 100% 0%, ${DEEP_2} 0%, ${DEEP} 62%)`, color: WHITE }}>
      {mascot && <img src={logo2xUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-1 right-2 h-24 w-auto rotate-[9deg] md:h-28 lg:right-10" />}
      <div className={`relative flex items-start justify-between gap-3 ${mascot ? "pr-20 md:pr-24" : ""}`}>
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: YELLOW }}>{eyebrow}</p>}
          <h1 className="mt-1 text-[1.65rem] font-black leading-[1.05] tracking-tight md:text-4xl" style={{ fontFamily: DISPLAY_FONT }}>{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm" style={{ color: "#c9dccf" }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children && <div className="relative mt-3">{children}</div>}
    </section>
  );
}

/** The white, dotted content panel that slides up over a PageHero. */
export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative -mx-4 -mb-28 -mt-7 min-h-[70vh] rounded-t-[28px] px-4 pb-28 pt-5 md:-mx-6 md:px-6 lg:-mx-10 lg:-mb-12 lg:px-10 lg:pb-12 ${className}`}
      style={{ background: WHITE, backgroundImage: DOT_BG, backgroundSize: "16px 16px" }}>
      {children}
    </div>
  );
}

/** A thin progress bar for headers (yellow on green). */
export function HeroProgress({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} role="progressbar"
      aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: YELLOW }} />
    </div>
  );
}

/** Progress ring tile: label, big value and a ring (design D). */
export function RingTile({ label, value, fraction, color = PICKLE }: { label: string; value: string; fraction: number; color?: string }) {
  const p = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl p-3" style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: CARD_GLOW }}>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: WHITE_SUB }}>{label}</p>
        {/* Words (like a level name) wrap at a smaller size instead of overflowing the tile. */}
        <p className={`${value.length > 6 ? "text-base leading-tight" : "text-2xl"} font-black tracking-tight`} style={{ color: INK }}>{value}</p>
      </div>
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${p}%, #edf1ee 0)` }}>
        <span className="h-8 w-8 rounded-full" style={{ background: WHITE }} />
      </span>
    </div>
  );
}

/** Screen title row used at the top of each tab. */
export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#16181d] md:text-3xl" style={{ fontFamily: DISPLAY_FONT }}>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm" style={{ color: WHITE_DIM }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-[#16181d]" style={{ fontFamily: DISPLAY_FONT }}>{children}</h2>
      {action}
    </div>
  );
}

export function Notice({ tone = "info", onDark = false, children }: { tone?: "info" | "warn" | "error"; onDark?: boolean; children: ReactNode }) {
  const color = tone === "error" ? "#b4233f" : tone === "warn" ? ORANGE : COBALT;
  const darkColor = tone === "error" ? "#ffb5c6" : tone === "warn" ? "#ffc19f" : OPTIC;
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
      style={onDark
        ? { background: "rgba(255,255,255,0.08)", border: `1px solid ${darkColor}70`, color: darkColor }
        : { background: tone === "info" ? GREEN_BG : `${color}0f`, border: `1px solid ${color}40`, color }}>
      {children}
    </div>
  );
}

// ── Brand mark ────────────────────────────────────────────────────────────
/** The pickle mascot on an optic-yellow tile, for narrow spaces such as the tablet rail. */
export function PickleProMark({ size = 40 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center overflow-hidden rounded-xl" style={{ width: size, height: size, background: OPTIC }} aria-hidden>
      <img src={logoUrl} srcSet={`${logoUrl} 1x, ${logo2xUrl} 2x`} alt="" style={{ height: size * 0.86, width: "auto" }} />
    </span>
  );
}

export function PickleProLogo({ size = "md", tone = "dark" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  const height = size === "lg" ? 64 : size === "sm" ? 40 : 52;
  const onLight = tone === "light";
  return (
    <div className="flex items-center gap-2">
      <img src={logoUrl} srcSet={`${logoUrl} 1x, ${logo2xUrl} 2x`} alt="" aria-hidden className="flex-shrink-0" style={{ height, width: "auto" }} />
      <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: size === "lg" ? "2rem" : size === "sm" ? "1.25rem" : "1.6rem",
        letterSpacing: "-0.02em", lineHeight: 1, color: onLight ? INK : WHITE }}>
        Pickle<span style={{ color: onLight ? GREEN : OPTIC }}>Pro</span>
      </span>
    </div>
  );
}

export const fieldStyle = {
  background: WHITE,
  border: `1px solid ${BORDER}`,
  color: INK,
} as const;

export const labelClass = "block text-sm font-semibold mb-1.5";
export const labelStyle = { color: WHITE_DIM } as const;
export const subtleText = { color: WHITE_SUB } as const;
