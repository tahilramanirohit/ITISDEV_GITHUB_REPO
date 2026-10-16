import type { ReactNode } from "react";

/** The smile, in the head's own coordinates (the head group is drawn at translate(120 26)). */
export const COACH_SMILE = "M49 106 Q60 116 71 106";

/**
 * Piko, the Hasa mascot and logo: the pickle holding a paddle up, ball above, hand on hip
 * (identity 01b pose, same head and face as docs/brand/hasa/logos). This is the brand mark:
 * the header logo, welcome, onboarding, brand cards, empty states and the talking coach.
 * App and browser icons stay the face-only icon, because a full body is unreadable at 16–48px.
 *
 * `onDark` sets Piko on a paper tile so the ink limbs and paddle stay visible on forest.
 * `mouth` replaces the smile (the talking coach); draw it in head coordinates.
 * `shadow` adds the soft ground shadow (on for large sizes).
 */
export function Coach({ size = 96, title, mouth, onDark = false, shadow, className = "" }: {
  size?: number; title?: string; mouth?: ReactNode; onDark?: boolean; shadow?: boolean; className?: string;
}) {
  const showShadow = shadow ?? size >= 120;
  const art = (
    <svg viewBox={`0 0 360 ${showShadow ? 350 : 336}`} height={size} width={size * (360 / (showShadow ? 350 : 336))}
      className={`block shrink-0 ${onDark ? "" : className}`}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {showShadow && <ellipse cx="180" cy="334" rx="86" ry="8" fill="#E2DAC2" />}
      <g fill="none" stroke="#0B2A1A" strokeLinecap="round" strokeLinejoin="round">
        <path d="M150 150 L128 184 L148 206" strokeWidth="13" />
        <path d="M168 230 L154 276 L150 318" strokeWidth="15" />
        <path d="M192 230 L208 276 L210 318" strokeWidth="15" />
        <path d="M210 156 L236 188 L262 170" strokeWidth="13" />
      </g>
      <circle cx="148" cy="206" r="9" fill="#0B2A1A" />
      <rect x="124" y="312" width="44" height="16" rx="8" fill="#0B2A1A" />
      <rect x="194" y="312" width="44" height="16" rx="8" fill="#0B2A1A" />
      <g transform="translate(120 26)">
        <rect x="54" y="2" width="12" height="22" rx="6" transform="rotate(10 60 14)" fill="#2E6B2F" />
        <path d="M60 16 C82 16 94 30 94 60 L94 168 C94 196 80 210 60 210 C40 210 26 196 26 168 L26 60 C26 30 38 16 60 16 Z" fill="#8CC63F" />
        <g fill="#8CC63F"><circle cx="27" cy="96" r="5" /><circle cx="27" cy="132" r="5" /><circle cx="27" cy="170" r="5" /><circle cx="93" cy="84" r="5" /><circle cx="93" cy="120" r="5" /><circle cx="93" cy="158" r="5" /></g>
        <rect x="24" y="44" width="72" height="18" rx="6" fill="#FAF6EA" />
        <g fill="none" stroke="#0B2A1A" strokeLinecap="round">
          <path d="M39 73 Q45 68 52 71" strokeWidth="4" /><path d="M68 71 Q75 68 81 73" strokeWidth="4" />
          {mouth ? null : <path d={COACH_SMILE} strokeWidth="4.5" />}
        </g>
        {mouth}
        <g fill="#0B2A1A"><ellipse cx="46" cy="88" rx="6.5" ry="8.5" /><ellipse cx="73" cy="88" rx="6.5" ry="8.5" /></g>
        <g fill="#FAF6EA"><circle cx="48.5" cy="84.5" r="2.3" /><circle cx="75.5" cy="84.5" r="2.3" /></g>
      </g>
      <g transform="translate(262 170) rotate(40)">
        <rect x="-6" y="-42" width="12" height="44" rx="6" fill="#0B2A1A" />
        <rect x="-28" y="-110" width="56" height="72" rx="24" fill="#0F3D24" />
      </g>
      <circle cx="262" cy="170" r="10" fill="#0B2A1A" />
      <g fill="none" stroke="#8CC63F" strokeWidth="5" strokeLinecap="round"><path d="M226 30 Q240 22 256 26" /><path d="M230 48 Q242 44 254 48" /></g>
      <circle cx="282" cy="40" r="15" fill="#F5C518" />
      <g fill="#0F3D24"><circle cx="276" cy="35" r="2.6" /><circle cx="287" cy="37" r="2.6" /><circle cx="281" cy="47" r="2.6" /></g>
    </svg>
  );
  if (!onDark) return art;
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-[var(--radius-md)] p-1.5 ${className}`} style={{ background: "#F1ECDC" }}>
      {art}
    </span>
  );
}
