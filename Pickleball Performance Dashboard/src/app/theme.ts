// ── Palette ────────────────────────────────────────────────────────────────
// Hasa brand (identity 01c). Every value points at a CSS variable defined once in
// src/styles/theme.css, so the palette lives in one place. Older names are kept
// so existing screens recolour without edits.
//
// These are CSS strings ("var(--ink)"): use them in style props and CSS, never
// on a <canvas> and never with a hex alpha suffix. For a translucent tint use
// withAlpha(color, 0.25).
export const INK       = "var(--ink)";
export const PAGE_BG   = "var(--paper)";
export const BLUE_DEEP = "var(--paper)";
export const BLUE_MID  = "var(--surface-raised)";   // card surface
export const PAPER     = "var(--surface-sunken)";

export const DEEP      = "var(--forest)";           // brand green: selected states, brand panel
export const DEEP_2    = "var(--forest)";
export const PICKLE    = "var(--pickle-ink)";       // progress fills, active tab, "good"
export const BLUE      = "var(--pickle-ink)";       // green text and links (readable on paper)
export const BLUE_BG   = "var(--surface-sunken)";   // selected / info tint
export const HERO      = "var(--brand-surface)";
export const YELLOW    = "var(--ball)";             // accent only, never text on paper
export const YELLOW_INK = "var(--ink)";
export const YELLOW_BG = "var(--surface-sunken)";
export const SUCCESS   = "var(--pickle-ink)";

// Older names, mapped onto the palette above.
export const GREEN     = BLUE;
export const GREEN_BG  = BLUE_BG;
export const OPTIC     = YELLOW;
export const OPTIC_INK = YELLOW_INK;
export const BLUE_POP  = BLUE;
export const BLUE_SKY  = BLUE;
export const COBALT    = BLUE;
export const NEON      = "var(--action-bg)";        // primary button background
export const NEON_D    = "var(--action-ink)";       // primary button text
export const NAVY      = HERO;                      // brand surfaces
export const LAVENDER  = YELLOW;                    // accent on brand surfaces

export const ORANGE    = "var(--warning)";
export const ORANGE_L  = "var(--warning)";
export const ROSE      = "var(--danger)";
export const VIOLET    = "var(--ink-muted)";
export const WHITE     = "var(--surface-raised)";
export const WHITE_DIM = "var(--ink-muted)";        // secondary text
export const WHITE_SUB = "var(--ink-muted)";        // tertiary text (same token, keeps 4.5:1)
export const BORDER    = "var(--line)";
export const CARD_GLOW = "none";                    // cards use a border, never a shadow
export const SHADOW_LIFT = "var(--shadow-lift)";    // floating layers only: sheets, menus, toasts, tab bar
export const DOT_BG = "none";

// Text and tints on the forest brand surface (one brand card per screen, the coach player).
export const ON_BRAND = "#FAF6EA";
export const ON_BRAND_MUTED = "#B4C2B8";
export const ON_BRAND_PICKLE = "#8CC63F";
export const ON_BRAND_TINT = "rgba(250,246,234,0.1)";

export const DISPLAY_FONT = "var(--font-display)";
export const BODY_FONT = "var(--font-body)";

/** A translucent version of a palette colour, e.g. for tinted borders and chip fills. */
export function withAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
