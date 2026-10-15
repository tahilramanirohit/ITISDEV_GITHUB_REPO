import { BRAND_NAME } from "../brand";

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

/** The app icon (simplified face), for small spots such as the tablet rail. */
export function AppIcon({ size = 40 }: { size?: number }) {
  const src = size > 48 ? "/brand/hasa-app-icon.svg" : "/brand/hasa-app-icon-small.svg";
  return <img src={src} alt="" aria-hidden="true" width={size} height={size} className="block shrink-0" />;
}
