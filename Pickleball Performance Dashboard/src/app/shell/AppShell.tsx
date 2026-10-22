import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { BarChart3, CalendarDays, Home, Plus, UserRound, UsersRound } from "lucide-react";
import { BODY_FONT, BORDER, GREEN, GREEN_BG, INK, NEON, NEON_D, PAGE_BG, PAPER, SHADOW_LIFT, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { PickleProLogo, PickleProMark } from "./primitives";
import { BRAND_NAME } from "../brand";

const TEXT_SIZE_KEY = "picklepro.largeText";

function readLargeText(): boolean {
  try {
    return window.localStorage.getItem(TEXT_SIZE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Scales every rem-based size on the page, remembered on this device. */
export function LargeTextToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [large, setLarge] = useState(readLargeText);
  useEffect(() => {
    document.documentElement.style.fontSize = large ? "118.75%" : "";
    try {
      window.localStorage.setItem(TEXT_SIZE_KEY, large ? "1" : "0");
    } catch {
      // Storage can be blocked; the setting then lasts for this visit only.
    }
  }, [large]);
  const dark = tone === "dark";
  return (
    <button type="button" aria-pressed={large} onClick={() => setLarge((v) => !v)}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-bold"
      style={{ color: dark ? "#FAF6EA" : INK, border: `1px solid ${large ? GREEN : dark ? "rgba(250,246,234,0.3)" : BORDER}`,
        background: large ? (dark ? "rgba(250,246,234,0.12)" : GREEN_BG) : dark ? "transparent" : WHITE }}>
      <span aria-hidden="true" style={{ fontSize: "0.8em" }}>A</span><span aria-hidden="true" style={{ fontSize: "1.2em" }}>A</span>
      {large ? "Normal text" : "Larger text"}
    </button>
  );
}

/** A count on a tab (for example buddy requests waiting for an answer); hidden at zero. */
function Badge({ count, label }: { count?: number; label: string }) {
  if (!count) return null;
  return <>
    <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-none"
      style={{ background: "var(--danger)", color: "#ffffff" }}>{count > 9 ? "9+" : count}</span>
    <span className="sr-only">, {count} {label}</span>
  </>;
}

export type TabBadges = Partial<Record<string, number>>;

const TABS = [
  { href: "#/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "#/sessions", label: "Sessions", icon: CalendarDays, match: (p: string) => p.startsWith("/sessions") },
  { href: "#/new", label: "Log", icon: Plus, match: (p: string) => p === "/new", primary: true },
  { href: "#/progress", label: "Progress", icon: BarChart3, match: (p: string) => p === "/progress" },
  { href: "#/buddy", label: "Buddy", icon: UsersRound, match: (p: string) => p === "/buddy" },
  { href: "#/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/profile") },
] as const;

/**
 * Floating tab bar: icon and label in a raised capsule (the one floating layer, so it lifts),
 * the current screen on the sunken tint, and the player's own photo as the Profile button.
 */
function BottomTabs({ avatar, badges }: { avatar?: ReactNode; badges?: TabBadges }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 desktop:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
      <ul className="pointer-events-auto mx-auto flex max-w-md items-center justify-between rounded-[var(--radius-lg)] px-1.5 py-1.5 md:max-w-lg"
        style={{ background: WHITE, border: `1px solid ${BORDER}`, boxShadow: SHADOW_LIFT }}>
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          const isProfile = tab.href === "#/profile";
          return (
            <li key={tab.href} className="flex-1">
              <a href={tab.href} aria-label={badges?.[tab.href] ? `${tab.label}, ${badges[tab.href]} waiting` : tab.label} title={tab.label}
                aria-current={active ? "page" : undefined}
                className="mx-auto flex h-14 max-w-[72px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] transition-colors"
                style={{ background: active ? GREEN_BG : "transparent", color: active ? INK : WHITE_DIM }}>
                {"primary" in tab
                  ? <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)]" style={{ background: NEON, color: NEON_D }}><Icon size={20} strokeWidth={2.25} aria-hidden="true" /></span>
                  : isProfile && avatar
                    ? <span className="rounded-full" style={{ boxShadow: active ? `0 0 0 2px ${GREEN}` : `0 0 0 1px ${BORDER}` }}>{avatar}</span>
                    : <span className="relative"><Icon size={22} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
                      <Badge count={badges?.[tab.href]} label="waiting" /></span>}
                <span aria-hidden="true" className="text-[12px] font-bold leading-4">{tab.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Computer navigation: a left sidebar instead of the bottom tab bar. It narrows to an icon
 * rail when the browser window is small, so the bottom bar never appears on a computer.
 */
function SideNav({ account, badges }: { account?: ReactNode; badges?: TabBadges }) {
  const { pathname } = useLocation();
  const items = TABS.filter((t) => !("primary" in t));
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r px-3 py-6 desktop:flex lg:w-64 lg:items-stretch lg:px-4" style={{ background: PAGE_BG, borderColor: BORDER }}>
      <a href="#/" aria-label={`${BRAND_NAME} home`} className="lg:px-2">
        <span className="lg:hidden"><PickleProMark size={44} /></span>
        <span className="hidden lg:block"><PickleProLogo size="sm" tone="light" /></span>
      </a>
      <a href="#/new" aria-label="Log a session" title="Log a session" className="mt-6 flex h-12 w-12 items-center justify-center gap-2 rounded-[var(--radius-md)] type-body-strong lg:w-auto"
        style={{ background: NEON, color: NEON_D }}><Plus size={20} strokeWidth={2.25} aria-hidden="true" /><span className="hidden lg:inline">Log a session</span></a>
      <nav aria-label="Sidebar" className="mt-6 w-full">
        <ul className="space-y-1">
          {items.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <a href={tab.href} aria-current={active ? "page" : undefined} title={tab.label}
                  className="flex min-h-[44px] items-center justify-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-bold transition-colors hover:bg-sunken lg:justify-start"
                  style={active ? { background: PAPER, color: INK } : { color: WHITE_DIM }}>
                  <span className="relative"><Icon size={20} strokeWidth={active ? 2 : 1.75} aria-hidden="true" style={active ? { color: GREEN } : undefined} />
                    <Badge count={badges?.[tab.href]} label="waiting" /></span><span className="sr-only lg:not-sr-only">{tab.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto hidden space-y-3 px-2 lg:block">
        {account}
        <p className="text-xs leading-relaxed" style={{ color: WHITE_SUB }}>PicklePro research prototype. Video findings have not yet been validated on real footage.</p>
      </div>
    </aside>
  );
}

/**
 * Mobile-first frame. `tabs` shows the app's navigation (signed-in screens):
 * bottom tabs on phones, a sidebar and wider content on desktop. `wide` lets
 * research tools use more of a desktop screen.
 */
export function AppShell({ children, right, nav, tabs = false, wide = false, avatar, badges }: {
  children: ReactNode; right?: ReactNode; nav?: ReactNode; tabs?: boolean; wide?: boolean;
  /** The player's photo for the Profile button in the phone tab bar. */ avatar?: ReactNode;
  /** Counts shown on tabs, keyed by the tab's link (e.g. "#/buddy"). */ badges?: TabBadges;
}) {
  // Phones: one column. Tablets: the same layout, wider and with larger type.
  // Desktop: the signed-in app uses the whole screen beside the sidebar.
  const width = wide ? "max-w-6xl" : tabs ? "max-w-xl md:max-w-none" : "max-w-xl md:max-w-3xl";
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", color: INK, fontFamily: BODY_FONT }}>
      {/* A button rather than a "#" link, because the hash holds the app's route. */}
      <button type="button" onClick={() => document.getElementById("main-content")?.focus()}
        className="sr-only z-50 rounded-xl px-4 py-2 text-sm font-bold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        style={{ background: INK, color: WHITE }}>Skip to main content</button>
      {tabs && <SideNav account={right} badges={badges} />}
      <div className={tabs ? "desktop:pl-20 desktop:lg:pl-64" : undefined}>
        {/* Paper header: wordmark on the left, at most two actions on the right. */}
        <header className={`sticky top-0 z-20 border-b ${tabs ? "desktop:hidden" : ""}`} style={{ background: PAGE_BG,
          color: INK, borderColor: BORDER, paddingTop: "env(safe-area-inset-top)" }}>
          <div className={`${width} mx-auto flex h-14 items-center justify-between gap-3 px-4 md:px-6`}>
            <a href="#/" aria-label={`${BRAND_NAME} home`} className="flex min-h-[44px] items-center"><PickleProLogo size="sm" tone="light" /></a>
            <div className="flex min-w-0 items-center gap-2">{right}</div>
          </div>
          {nav && <nav className={`${width} mx-auto flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-sm font-bold`}>{nav}</nav>}
        </header>
        <main id="main-content" tabIndex={-1} className={`${width} mx-auto px-4 pt-5 outline-none ${tabs ? "pb-28 md:px-6 md:pt-6 lg:px-10 lg:pt-8 desktop:pb-12" : "pb-10 md:px-6"}`}>{children}</main>
        {!tabs && <footer className="px-4 pb-6 text-center text-xs" style={{ color: WHITE_SUB }}>
          PicklePro research prototype. Video findings depend on visibility and have not yet been validated on real footage.
        </footer>}
      </div>
      {tabs && <BottomTabs avatar={avatar} badges={badges} />}
    </div>
  );
}
