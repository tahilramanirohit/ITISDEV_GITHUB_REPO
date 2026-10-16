import { BRAND_NAME } from "../brand";
import { Coach } from "./Coach";

/**
 * The Hasa wordmark: the drawn "h" followed by live "asa" in Bricolage Grotesque 800,
 * with the 01c letter spacing. Never set the name as plain text in its place.
 * `tone="light"` is for paper backgrounds (forest ink); `tone="dark"` is for forest or ink backgrounds.
 */
export function Wordmark({ size = 28, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  return (
    <span role="img" aria-label={BRAND_NAME} className="inline-flex items-baseline whitespace-nowrap"
      style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: 0,
        color: tone === "dark" ? "#FAF6EA" : "var(--forest)" }}>
      <svg viewBox="0 0 102 150" aria-hidden="true" style={{ height: "0.72em", width: "0.4896em", display: "inline-block", alignSelf: "baseline" }}>
        <path fill="currentColor" d="M0 16 L34 4 L34 62 C42 52 54 46 68 46 C90 46 102 60 102 84 L102 150 L68 150 L68 92 C68 81 62 76 54 76 C44 76 34 83 34 95 L34 150 L0 150 Z" />
      </svg>
      <span aria-hidden="true" style={{ marginLeft: "0.005em" }}>a</span>
      <span aria-hidden="true" style={{ marginLeft: "-0.03em" }}>s</span>
      <span aria-hidden="true" style={{ marginLeft: "-0.005em" }}>a</span>
    </span>
  );
}

/** Piko's full-face app icon (forest square). Only for app and browser icons and tiny spots. */
export function AppIcon({ size = 40 }: { size?: number }) {
  return <img src="/brand/hasa-app-icon.svg" alt="" aria-hidden="true" width={size} height={size} className="block shrink-0" />;
}

/**
 * The Piko mark: the pickle's head and body, no square (01b logo lockup). This is the logo mark.
 * Same geometry as docs/brand/hasa/logos/hasa-mark-one-colour.svg, in full colour.
 */
export function PikoMark({ height = 40 }: { height?: number }) {
  return (
    <svg viewBox="0 0 120 150" height={height} width={height * 0.8} aria-hidden="true" className="block shrink-0">
      <rect x="54" y="2" width="12" height="22" rx="6" transform="rotate(10 60 14)" fill="#2E6B2F" />
      <path d="M60 16 C82 16 94 30 94 60 L94 150 L26 150 L26 60 C26 30 38 16 60 16 Z" fill="#8CC63F" />
      <g fill="#8CC63F"><circle cx="27" cy="96" r="5" /><circle cx="27" cy="132" r="5" /><circle cx="93" cy="84" r="5" /><circle cx="93" cy="120" r="5" /></g>
      <rect x="24" y="44" width="72" height="18" rx="6" fill="#FAF6EA" />
      <g fill="none" stroke="#0B2A1A" strokeLinecap="round"><path d="M39 73 Q45 68 52 71" strokeWidth="4" /><path d="M68 71 Q75 68 81 73" strokeWidth="4" /><path d="M49 106 Q60 116 71 106" strokeWidth="4.5" /></g>
      <g fill="#0B2A1A"><ellipse cx="46" cy="88" rx="6.5" ry="8.5" /><ellipse cx="73" cy="88" rx="6.5" ry="8.5" /></g>
      <g fill="#FAF6EA"><circle cx="48.5" cy="84.5" r="2.3" /><circle cx="75.5" cy="84.5" r="2.3" /></g>
    </svg>
  );
}

/** The logo: the full Piko mascot beside the wordmark. Used in the header, sidebar and welcome. */
export function Logo({ size = 26, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Coach size={Math.round(size * 2)} shadow={false} />
      <Wordmark size={size} tone={tone} />
    </span>
  );
}
