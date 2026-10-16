import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, CircleAlert, Eye, EyeOff, Info, TriangleAlert } from "lucide-react";
import { Logo, PikoMark } from "./Wordmark";
import {
  BORDER, DEEP, GREEN, GREEN_BG, INK, NEON, NEON_D, ORANGE, PAPER, PICKLE, ROSE, SHADOW_LIFT, VIOLET, WHITE, WHITE_DIM, WHITE_SUB, YELLOW, YELLOW_INK,
} from "../theme";

// Hasa components: paper page, raised cards with one 1px line and the large radius, no card
// shadows (only floating layers lift), one primary action per screen, type from the scale.

// ── Card ──────────────────────────────────────────────────────────────────
/** A raised card. `accent` is accepted for older call sites but no longer draws a coloured edge. */
export function Card({ children, className = "", accent: _accent }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`rounded-[var(--radius-lg)] p-4 sm:p-6 ${className}`}
      style={{ background: WHITE, color: INK, border: `1px solid ${BORDER}` }}>
      {children}
    </div>
  );
}

// ── Section Banner ────────────────────────────────────────────────────────
export function SectionBanner({ n, eyebrow, title, subtitle, bg: _bg, accent: _accent, badge }: {
  n: string; eyebrow: string; title: string; subtitle: string; bg: string; accent: string; badge?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-4 rounded-[var(--radius-lg)] px-5 py-4" style={{ background: PAPER, border: `1px solid ${BORDER}` }}>
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] type-body-strong"
        style={{ background: DEEP, color: NEON_D }}>{n}</div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mb-0.5 type-label" style={{ color: WHITE_DIM }}>{eyebrow}</div>
          {badge && <Pill color={ORANGE}>{badge}</Pill>}
        </div>
        <div className="type-heading" style={{ color: INK }}>{title}</div>
        <div className="mt-0.5 type-small" style={{ color: WHITE_DIM }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Widget Header ─────────────────────────────────────────────────────────
export function WidgetHeader({ title, subtitle, accent: _accent, level = "h3" }: { title: string; subtitle: string; accent?: string; level?: "h1" | "h2" | "h3" }) {
  const Heading = level;
  return (
    <div className="mb-4">
      <Heading className="mb-0.5 type-heading font-bold" style={{ color: INK }}>{title}</Heading>
      <p className="type-small" style={{ color: WHITE_DIM }}>{subtitle}</p>
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────
export function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: any[]; label?: string; suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--radius-sm)] border px-3 py-2 type-small" style={{ background: WHITE, borderColor: BORDER, boxShadow: SHADOW_LIFT }}>
      {label && <div className="mb-1.5 font-bold" style={{ color: INK }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: p.color ?? GREEN }} />
          <span style={{ color: WHITE_DIM }}>{p.name}:</span>
          <span className="font-bold" style={{ color: INK }}>{typeof p.value === "number" ? `${p.value.toFixed(p.value < 10 ? 1 : 0)}${suffix}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Small labelled chip ───────────────────────────────────────────────────
/** A status tag: label style on the sunken surface, in the given (text-safe) colour. */
export function Pill({ children, color = VIOLET, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 type-label"
      style={{ background: PAPER, color }}>
      {children}
    </span>
  );
}

/** A tappable choice chip, used for single and multiple selection. Selected chips show a check, so state never relies on colour. */
export function Chip({ selected, children, onClick, label }: { selected: boolean; children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-pressed={selected} aria-label={label} onClick={onClick}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors"
      style={selected
        ? { background: NEON, color: NEON_D, border: `1px solid ${NEON}` }
        : { background: PAPER, color: INK, border: "1px solid transparent" }}>
      {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * The screen's main action (one per screen), sized for thumbs.
 * tone "dark" = primary; "light" = secondary; "optic" = the ball-yellow button, only on a brand card.
 */
export function PrimaryButton({ children, className = "", tone = "dark", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "dark" | "optic" | "light" }) {
  const style = tone === "optic" ? { background: YELLOW, color: YELLOW_INK }
    : tone === "light" ? { background: WHITE, color: INK, border: `1px solid ${BORDER}` }
    : { background: NEON, color: NEON_D };
  return (
    <button {...rest}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--radius-md)] px-6 py-3 type-body-strong transition-transform active:scale-[0.98] disabled:opacity-50 ${className}`}
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
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b" style={{ borderColor: BORDER }}>
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button key={tab.value} type="button" role="tab" id={`${idBase}-tab-${tab.value}`} aria-controls={`${idBase}-panel-${tab.value}`}
            aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(tab.value)} onKeyDown={(e) => onKeyDown(e, index)}
            className="-mb-px min-h-[44px] shrink-0 whitespace-nowrap border-b-[3px] px-0.5 py-2 text-sm font-bold transition-colors"
            style={active ? { color: INK, borderColor: PICKLE } : { color: WHITE_DIM, borderColor: "transparent" }}>
            {tab.label}
            {tab.badge && <span className="ml-1.5 type-label" style={{ color: active ? GREEN : WHITE_SUB }}>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The top of a screen, on paper: eyebrow label, screen title and a short line under it. */
export function PageHero({ eyebrow, title, subtitle, mascot: _mascot = false, action, children }: {
  eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; mascot?: boolean; action?: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="relative pb-6" style={{ color: INK }}>
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="type-label" style={{ color: WHITE_DIM }}>{eyebrow}</p>}
          <h1 className="mt-1 type-display-lg" style={{ color: INK }}>{title}</h1>
          {subtitle && <div className="mt-1.5 type-small" style={{ color: WHITE_DIM }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  );
}

/** The content under a PageHero. It used to be a white panel over the green header; on paper it is a plain wrapper. */
export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative ${className}`}>{children}</div>;
}

/** A thin progress bar: 8px pill track, green fill. */
export function HeroProgress({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ background: PAPER }} role="progressbar"
      aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: PICKLE }} />
    </div>
  );
}

/** A number tile: label, big value and a progress ring. */
export function RingTile({ label, value, fraction, color = PICKLE }: { label: string; value: string; fraction: number; color?: string }) {
  const p = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] p-4" style={{ background: WHITE, border: `1px solid ${BORDER}` }}>
      <div className="min-w-0">
        <p className="type-label" style={{ color: WHITE_SUB }}>{label}</p>
        {/* Words (like a level name) wrap at a smaller size instead of overflowing the tile. */}
        <p className={`mt-1 ${value.length > 6 ? "type-body-strong" : "type-stat"}`} style={{ color: INK }}>{value}</p>
      </div>
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${p}%, ${PAPER} 0)` }}>
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
        <h1 className="type-display-lg" style={{ color: INK }}>{title}</h1>
        {subtitle && <p className="mt-0.5 type-small" style={{ color: WHITE_DIM }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="type-heading" style={{ color: INK }}>{children}</h2>
      {action}
    </div>
  );
}

/** A status message. The icon and wording carry the status, colour only supports it. */
export function Notice({ tone = "info", onDark = false, children }: { tone?: "info" | "warn" | "error"; onDark?: boolean; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : tone === "warn" ? TriangleAlert : Info;
  const color = tone === "error" ? ROSE : tone === "warn" ? ORANGE : INK;
  // On the forest brand surface: paper text, with the dark-theme danger tint for errors.
  const darkColor = tone === "error" ? "#FF8A7A" : "#FAF6EA";
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className="flex items-start gap-2.5 rounded-[var(--radius-md)] px-4 py-3 type-small"
      style={onDark
        ? { background: "rgba(250,246,234,0.08)", border: "1px solid rgba(250,246,234,0.25)", color: darkColor }
        : { background: tone === "info" ? GREEN_BG : WHITE, border: `1px solid ${BORDER}`, color }}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── Brand mark ────────────────────────────────────────────────────────────
/** The Piko mark on its own, for narrow spaces such as the tablet rail. */
export function PickleProMark({ size = 40 }: { size?: number }) {
  return <PikoMark height={size} />;
}

/** The Hasa logo: Piko's icon and the wordmark. `tone="dark"` sits on forest or ink, `tone="light"` on paper. */
export function PickleProLogo({ size = "md", tone = "dark" }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light" }) {
  return <Logo size={size === "lg" ? 40 : size === "sm" ? 26 : 32} tone={tone} />;
}

/** Inputs: raised surface, one line border, the small radius, 48px tall. */
export const fieldStyle = {
  background: WHITE,
  border: `1px solid ${BORDER}`,
  borderRadius: "var(--radius-sm)",
  minHeight: 48,
  color: INK,
} as const;

/** Labels sit above their field and are always visible. */
export const labelClass = "block text-sm font-bold mb-1.5";
export const labelStyle = { color: INK } as const;
export const subtleText = { color: WHITE_SUB } as const;

/** Password field with a show/hide button, so people can check what they typed on a phone keyboard. */
export function PasswordInput({ className = "", style, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={shown ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        className={`w-full pr-14 ${className}`} style={{ ...fieldStyle, ...style }} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
        className="absolute inset-y-0 right-1 my-auto flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)]" style={{ color: WHITE_SUB }}>
        {shown ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
