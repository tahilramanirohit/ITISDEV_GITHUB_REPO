import { useId, type ReactNode } from "react";

/** The smile, in the head's own coordinates (the same head geometry as the brand coach). */
export const COACH_SMILE = "M49 106 Q60 116 71 106";

/**
 * Piko, the Hasa coach, as the full-face app icon (docs/brand/hasa/logos/hasa-app-icon.svg).
 * This is Piko's one mark at every size: the logo, onboarding, empty states and the talking coach.
 * `mouth` replaces the smile (the talking coach); draw it in head coordinates.
 */
export function Coach({ size = 96, title, mouth, className = "" }: {
  size?: number; title?: string; mouth?: ReactNode; className?: string;
}) {
  const clip = `piko-${useId().replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`block shrink-0 ${className}`}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs><clipPath id={clip}><rect width="100" height="100" rx="22.5" /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill="#0F3D24" />
        <g transform="translate(12 8) scale(0.63333)">
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
      </g>
    </svg>
  );
}
