import type { ReactNode } from "react";

/** The smile, in the head's own coordinates (the head group is drawn at translate(120 26)). */
export const COACH_SMILE = "M49 106 Q60 116 71 106";

/**
 * The Hasa coach: a pickle in a sweatband, in the ready stance (docs/brand/hasa/logos/hasa-coach.svg).
 * Use it on onboarding, empty states and milestones only, one per screen at most.
 * `disc` sets it on a paper disc for dark backgrounds. `mouth` replaces the smile (for the talking coach);
 * it is drawn inside the head group, so use head coordinates.
 */
export function Coach({ size = 160, title, disc = false, mouth, className = "" }: {
  size?: number; title?: string; disc?: boolean; mouth?: ReactNode; className?: string;
}) {
  const art = (
    <svg viewBox="0 0 360 330" width={size} height={size * (330 / 360)} className={disc ? undefined : className}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g fill="none" stroke="#0B2A1A" strokeLinecap="round" strokeLinejoin="round">
        <path d="M152 150 L134 184 L156 200" strokeWidth="13" />
        <path d="M162 228 L138 264 L148 298" strokeWidth="15" />
        <path d="M198 228 L222 264 L212 298" strokeWidth="15" />
      </g>
      <circle cx="158" cy="200" r="9" fill="#0B2A1A" />
      <rect x="122" y="292" width="44" height="16" rx="8" fill="#0B2A1A" />
      <rect x="194" y="292" width="44" height="16" rx="8" fill="#0B2A1A" />
      <g transform="translate(120 26)">
        <rect x="54" y="2" width="12" height="22" rx="6" transform="rotate(10 60 14)" fill="#2E6B2F" />
        <path d="M60 16 C82 16 94 30 94 60 L94 168 C94 196 80 210 60 210 C40 210 26 196 26 168 L26 60 C26 30 38 16 60 16 Z" fill="#8CC63F" />
        <g fill="#8CC63F"><circle cx="27" cy="96" r="5" /><circle cx="27" cy="132" r="5" /><circle cx="27" cy="170" r="5" /><circle cx="93" cy="84" r="5" /><circle cx="93" cy="120" r="5" /><circle cx="93" cy="158" r="5" /></g>
        <rect x="24" y="44" width="72" height="18" rx="6" fill="#FAF6EA" />
        <g fill="none" stroke="#0B2A1A" strokeLinecap="round">
          <path d="M39 73 Q45 68 52 71" strokeWidth="4" /><path d="M68 71 Q75 68 81 73" strokeWidth="4" />
          {mouth ?? <path d={COACH_SMILE} strokeWidth="4.5" />}
        </g>
        <g fill="#0B2A1A"><ellipse cx="46" cy="88" rx="6.5" ry="8.5" /><ellipse cx="73" cy="88" rx="6.5" ry="8.5" /></g>
        <g fill="#FAF6EA"><circle cx="48.5" cy="84.5" r="2.3" /><circle cx="75.5" cy="84.5" r="2.3" /></g>
      </g>
      <g transform="translate(226 184) rotate(12)">
        <rect x="-6" y="-36" width="12" height="42" rx="6" fill="#0B2A1A" />
        <rect x="-28" y="-104" width="56" height="72" rx="22" fill="#0F3D24" />
      </g>
      <path d="M208 150 L238 172 L228 184" fill="none" stroke="#0B2A1A" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="226" cy="184" r="10" fill="#0B2A1A" />
      <g fill="none" stroke="#8CC63F" strokeWidth="4" strokeLinecap="round"><path d="M322 40 Q334 34 346 38" /><path d="M324 56 Q334 53 344 57" /></g>
      <circle cx="306" cy="50" r="13" fill="#F5C518" />
      <g fill="#0F3D24"><circle cx="301" cy="46" r="2.4" /><circle cx="311" cy="47" r="2.4" /><circle cx="305" cy="56" r="2.4" /></g>
    </svg>
  );
  if (!disc) return art;
  // On dark backgrounds the ink limbs and paddle need a paper disc behind them.
  return (
    <span className={`inline-grid place-items-center rounded-full ${className}`} style={{ background: "#F1ECDC", width: size * 1.08, height: size * 1.08 }}>
      {art}
    </span>
  );
}
