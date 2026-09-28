import type { ReactNode } from "react";
import {
  BLUE_MID, BORDER, CARD_GLOW, DISPLAY_FONT, NEON, NEON_D, ORANGE, ORANGE_L, VIOLET, WHITE, WHITE_DIM, WHITE_SUB,
} from "../theme";

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, className = "", accent }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: BLUE_MID,
        boxShadow: CARD_GLOW,
        borderTop: accent ? `3px solid ${accent}` : `1px solid ${BORDER}`,
        border: accent ? undefined : `1px solid ${BORDER}`,
      }}
    >
      {children}
    </div>
  );
}

// ── Section Banner ────────────────────────────────────────────────────────
export function SectionBanner({ n, eyebrow, title, subtitle, bg, accent, badge }: {
  n: string; eyebrow: string; title: string; subtitle: string; bg: string; accent: string; badge?: string;
}) {
  return (
    <div className="rounded-2xl px-6 py-4 mb-5 flex items-start gap-4" style={{ background: bg, border: `1px solid ${accent}40` }}>
      <div
        className="rounded-xl w-12 h-12 flex items-center justify-center flex-shrink-0 font-mono font-bold text-lg"
        style={{ background: accent, color: accent === NEON ? NEON_D : WHITE }}
      >
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-bold tracking-widest mb-0.5" style={{ color: accent }}>{eyebrow}</div>
          {badge && <Pill color={ORANGE}>{badge}</Pill>}
        </div>
        <div className="font-bold text-lg text-white" style={{ fontFamily: DISPLAY_FONT, letterSpacing: "0.04em" }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: WHITE_DIM }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Widget Header ─────────────────────────────────────────────────────────
export function WidgetHeader({ title, subtitle, accent }: { title: string; subtitle: string; accent?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-semibold text-sm text-white mb-0.5" style={{ fontSize: "0.9rem" }}>{title}</h3>
      {accent
        ? <div className="flex items-center gap-1.5 mt-1">
            <div className="h-0.5 w-4 rounded" style={{ background: accent }} />
            <p className="text-xs" style={{ color: WHITE_DIM }}>{subtitle}</p>
          </div>
        : <p className="text-xs" style={{ color: WHITE_DIM }}>{subtitle}</p>
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
    <div className="rounded-xl border px-3 py-2 text-xs shadow-2xl" style={{ background: "#0a1f4e", borderColor: BORDER }}>
      {label && <div className="font-bold mb-1.5 text-white">{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color ?? NEON }} />
          <span style={{ color: WHITE_DIM }}>{p.name}:</span>
          <span className="font-bold text-white">{typeof p.value === "number" ? `${p.value.toFixed(p.value < 10 ? 1 : 0)}${suffix}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Small labelled chip ───────────────────────────────────────────────────
export function Pill({ children, color = VIOLET, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wider"
      style={{ background: `${color}25`, color, border: `1px solid ${color}60` }}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const color = tone === "error" ? "#f87171" : tone === "warn" ? ORANGE : "#38bdf8";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="rounded-xl px-4 py-2.5 text-xs leading-relaxed"
      style={{ background: `${color}18`, border: `1px solid ${color}50`, color: tone === "info" ? WHITE_DIM : ORANGE_L }}
    >
      {children}
    </div>
  );
}

// ── Brand mark ────────────────────────────────────────────────────────────
export function PickleProLogo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? 56 : 44;
  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ width: box, height: box, background: NEON, boxShadow: `0 0 18px ${NEON}80` }}
      >
        <svg viewBox="0 0 20 30" width={box * 0.55} height={box * 0.68} fill="none" aria-hidden>
          <path d="M10 1C5.5 1 1.5 4.5 1.5 9.5C1.5 14.5 5 17.5 10 17.5C15 17.5 18.5 14.5 18.5 9.5C18.5 4.5 14.5 1 10 1Z" fill={NEON_D} />
          <line x1="5" y1="7" x2="15" y2="7" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
          <line x1="4" y1="10" x2="16" y2="10" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
          <line x1="5" y1="13" x2="15" y2="13" stroke={NEON} strokeWidth="0.8" strokeOpacity="0.5" />
          <path d="M7.5 17.5 L8.5 20 L11.5 20 L12.5 17.5Z" fill={NEON_D} />
          <rect x="8" y="19.5" width="4" height="9.5" rx="2" fill={NEON_D} />
        </svg>
      </div>
      <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: size === "lg" ? "2.8rem" : "2.2rem", letterSpacing: "0.06em", lineHeight: 1, color: WHITE }}>
        Pickle<span style={{ color: NEON }}>Pro</span>
      </span>
    </div>
  );
}

export const fieldStyle = {
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${BORDER}`,
  color: WHITE,
} as const;

export const labelClass = "block text-xs font-semibold mb-1.5";
export const labelStyle = { color: WHITE_DIM } as const;
export const subtleText = { color: WHITE_SUB } as const;
