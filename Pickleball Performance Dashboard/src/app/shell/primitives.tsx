import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  BORDER, CARD_GLOW, COBALT, DISPLAY_FONT, GREEN, GREEN_BG, INK, NEON, OPTIC, OPTIC_INK, ORANGE, VIOLET, WHITE, WHITE_DIM, WHITE_SUB,
} from "../theme";

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, className = "", accent }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`rounded-3xl p-5 text-[#0e1116] ${className}`}
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
    <div className="rounded-3xl px-5 py-4 mb-5 flex items-start gap-4" style={{ background: bg, border: `1px solid ${accent}40` }}>
      <div className="rounded-2xl w-11 h-11 flex items-center justify-center flex-shrink-0 font-bold text-lg"
        style={{ background: accent, color: WHITE }}>{n}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: accent }}>{eyebrow}</div>
          {badge && <Pill color={ORANGE}>{badge}</Pill>}
        </div>
        <div className="font-bold text-lg text-[#0e1116]" style={{ fontFamily: DISPLAY_FONT }}>{title}</div>
        <div className="text-sm mt-0.5" style={{ color: WHITE_DIM }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Widget Header ─────────────────────────────────────────────────────────
export function WidgetHeader({ title, subtitle, accent }: { title: string; subtitle: string; accent?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-bold text-lg text-[#0e1116] mb-0.5" style={{ fontFamily: DISPLAY_FONT }}>{title}</h3>
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
      {label && <div className="font-bold mb-1.5 text-[#0e1116]">{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color ?? GREEN }} />
          <span style={{ color: WHITE_DIM }}>{p.name}:</span>
          <span className="font-bold text-[#0e1116]">{typeof p.value === "number" ? `${p.value.toFixed(p.value < 10 ? 1 : 0)}${suffix}` : p.value}</span>
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
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
      style={selected
        ? { background: INK, color: WHITE, border: `1px solid ${INK}` }
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
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${className}`}
      style={{ ...style, ...rest.style }}>
      {children}
    </button>
  );
}

/** Segmented control for switching between views of one screen. */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { value: T; label: string; badge?: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-2xl p-1" style={{ background: "#e6e8e3" }}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button key={tab.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(tab.value)}
            className="flex-1 min-h-[40px] rounded-xl px-2 py-2 text-sm font-semibold transition-colors"
            style={active ? { background: WHITE, color: INK, boxShadow: CARD_GLOW } : { color: WHITE_DIM }}>
            {tab.label}
            {tab.badge && <span className="ml-1 text-[11px] font-bold uppercase" style={{ color: active ? GREEN : WHITE_SUB }}>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Screen title row used at the top of each tab. */
export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-extrabold leading-tight text-[#0e1116]" style={{ fontFamily: DISPLAY_FONT }}>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm" style={{ color: WHITE_DIM }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-[#0e1116]" style={{ fontFamily: DISPLAY_FONT }}>{children}</h2>
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
export function PickleProLogo({ size = "md", tone = "dark" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  const box = size === "lg" ? 48 : size === "sm" ? 32 : 40;
  const onLight = tone === "light";
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ width: box, height: box, background: onLight ? INK : OPTIC }}>
        <svg viewBox="0 0 24 24" width={box * 0.62} height={box * 0.62} fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" fill={onLight ? OPTIC : INK} />
          {[[9, 8], [15, 8], [12, 12], [8, 15], [16, 15], [12, 17]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill={onLight ? INK : OPTIC} />
          ))}
        </svg>
      </div>
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
