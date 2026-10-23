// ── Palette: "Night Court" ──────────────────────────────────────────────────
// Every color is a CSS variable defined in styles/theme.css, with a light and a
// dark value, so the whole app follows the chosen appearance without per-screen
// code. One accent (court green, lime on dark) and one action color (ball lime)
// keep the screens calm; everything else is ink on paper.
//
// The older names (BLUE, NEON, OPTIC, …) are kept and mapped onto the new
// tokens, so screens that still use them pick up the same palette.

const v = (name: string) => `var(--pp-${name})`;

// Surfaces and ink
export const PAGE_BG   = v("bg");
export const SURFACE   = v("surface");     // cards, sheets, inputs
export const SURFACE_2 = v("surface-2");   // sunken rows, selected tabs, tracks
export const INK       = v("ink");         // body text and headings
export const INK_2     = v("ink-2");       // secondary text
export const INK_3     = v("ink-3");       // metadata only (dates, captions)
export const LINE      = v("line");        // hairline borders and dividers
export const LINE_STRONG = v("line-strong");

// The one accent, as a small ramp
export const ACCENT      = v("accent");       // rings, bars, chart marks
export const ACCENT_INK  = v("accent-ink");   // links and accent text (passes AA on surfaces)
export const ACCENT_SOFT = v("accent-soft");  // quiet accent fills

// Main action (ball lime) and strong (inverted ink) buttons
export const ACTION      = v("action");
export const ON_ACTION   = v("on-action");
export const ACTION_EDGE = v("action-edge");
export const ACTION_SOFT = v("action-soft");
export const STRONG      = v("strong");
export const ON_STRONG   = v("on-strong");

// Dark court surfaces (welcome screen, audio coach) stay dark in both modes.
export const HERO    = v("hero");
export const ON_HERO = v("on-hero");

// Status
export const WARN   = v("warn");
export const DANGER = v("danger");
export const VIOLET = v("violet");

/** A translucent version of any palette color, e.g. alpha(ACCENT, 20) for a 20% tint. */
export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(percent)}%, transparent)`;
}

// ── Older names, mapped onto the palette above ─────────────────────────────
export const BLUE_DEEP = PAGE_BG;
export const BLUE_MID  = SURFACE;
export const PAPER     = SURFACE_2;
export const DEEP      = STRONG;
export const DEEP_2    = STRONG;
export const PICKLE    = ACCENT;
export const BLUE      = ACCENT_INK;
export const BLUE_BG   = ACCENT_SOFT;
export const YELLOW    = ACTION;
export const YELLOW_INK = ON_ACTION;
export const YELLOW_BG = ACTION_SOFT;
export const SUCCESS   = ACCENT_INK;
export const GREEN     = ACCENT_INK;
export const GREEN_BG  = ACCENT_SOFT;
export const OPTIC     = ACTION;
export const OPTIC_INK = ON_ACTION;
export const BLUE_POP  = ACCENT_INK;
export const BLUE_SKY  = ACCENT_INK;
export const COBALT    = ACCENT_INK;
export const NEON      = STRONG;      // primary (non-lime) button background
export const NEON_D    = ON_STRONG;   // primary button text
export const NAVY      = HERO;
export const LAVENDER  = ACTION;      // accent text on hero surfaces
export const ORANGE    = WARN;
export const ORANGE_L  = WARN;
export const ROSE      = DANGER;
export const WHITE     = SURFACE;
export const WHITE_DIM = INK_2;
export const WHITE_SUB = INK_3;
export const BORDER    = LINE;
/** Cards separate by border and surface contrast, not ambient shadow. */
export const CARD_GLOW = "none";
export const DOT_BG = "none";

export const DISPLAY_FONT = "'Archivo',system-ui,-apple-system,sans-serif";
export const BODY_FONT = "'IBM Plex Sans',system-ui,-apple-system,sans-serif";

// ── Appearance (light, dark or follow the device) ──────────────────────────
export type Appearance = "system" | "light" | "dark";
const APPEARANCE_KEY = "picklepro:theme";

export function readAppearance(): Appearance {
  try {
    const saved = window.localStorage.getItem(APPEARANCE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  if (value === "system") delete root.dataset.theme;
  else root.dataset.theme = value;
  try {
    if (value === "system") window.localStorage.removeItem(APPEARANCE_KEY);
    else window.localStorage.setItem(APPEARANCE_KEY, value);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}
