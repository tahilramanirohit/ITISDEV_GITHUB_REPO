import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { BarChart3, CalendarDays, Home, Plus, UserRound } from "lucide-react";
import { BODY_FONT, BORDER, DEEP, GREEN, GREEN_BG, INK, OPTIC, OPTIC_INK, PAGE_BG, WHITE, WHITE_SUB } from "../theme";
import { PickleProLogo, PickleProMark } from "./primitives";

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
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold min-h-[40px]"
      style={{ color: dark ? WHITE : INK, border: `1px solid ${large ? GREEN : dark ? "rgba(255,255,255,0.3)" : BORDER}`,
        background: large ? (dark ? "#23332a" : "#e3f6ea") : "transparent" }}>
      <span aria-hidden="true" style={{ fontSize: "0.8em" }}>A</span><span aria-hidden="true" style={{ fontSize: "1.2em" }}>A</span>
      {large ? "Normal text" : "Larger text"}
    </button>
  );
}

const TABS = [
  { href: "#/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "#/sessions", label: "Sessions", icon: CalendarDays, match: (p: string) => p.startsWith("/sessions") },
  { href: "#/new", label: "Log", icon: Plus, match: (p: string) => p === "/new", primary: true },
  { href: "#/progress", label: "Progress", icon: BarChart3, match: (p: string) => p === "/progress" },
  { href: "#/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/profile") },
] as const;

/**
 * Floating tab bar like Facebook and Instagram: icons only in a rounded capsule, the current
 * screen in a soft bubble, and the player's own photo as the Profile button.
 */
function BottomTabs({ avatar }: { avatar?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 desktop:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
      <ul className="pointer-events-auto mx-auto flex max-w-md items-center justify-between rounded-full px-1.5 py-1.5 md:max-w-lg"
        style={{ background: "rgba(255,255,255,0.86)", backdropFilter: "blur(18px) saturate(1.6)", WebkitBackdropFilter: "blur(18px) saturate(1.6)",
          border: "1px solid rgba(229,231,235,0.9)", boxShadow: "0 10px 30px rgba(11,42,26,0.16)" }}>
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          const isProfile = tab.href === "#/profile";
          return (
            <li key={tab.href} className="flex-1">
              <a href={tab.href} aria-label={tab.label} title={tab.label} aria-current={active ? "page" : undefined}
                className="mx-auto flex h-12 max-w-[72px] items-center justify-center rounded-full transition-colors"
                style={{ background: active ? GREEN_BG : "transparent", color: active ? DEEP : INK }}>
                {"primary" in tab
                  ? <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: OPTIC, color: OPTIC_INK }}><Icon size={22} strokeWidth={2.6} /></span>
                  : isProfile && avatar
                    ? <span className="rounded-full" style={{ boxShadow: active ? `0 0 0 2px ${DEEP}` : "0 0 0 1px rgba(22,24,29,0.15)" }}>{avatar}</span>
                    : <Icon size={25} strokeWidth={active ? 2.5 : 1.9} fill={active && tab.href === "#/" ? "currentColor" : "none"} />}
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
function SideNav({ account }: { account?: ReactNode }) {
  const { pathname } = useLocation();
  const items = TABS.filter((t) => !("primary" in t));
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r px-3 py-6 desktop:flex lg:w-64 lg:items-stretch lg:px-4" style={{ background: WHITE, borderColor: BORDER }}>
      <a href="#/" aria-label="PicklePro home" className="lg:px-2">
        <span className="lg:hidden"><PickleProMark size={44} /></span>
        <span className="hidden lg:block"><PickleProLogo size="sm" tone="light" /></span>
      </a>
      <a href="#/new" aria-label="Log a session" title="Log a session" className="mt-6 flex h-12 w-12 items-center justify-center gap-2 rounded-full text-sm font-bold lg:w-auto"
        style={{ background: OPTIC, color: OPTIC_INK }}><Plus size={20} strokeWidth={2.6} /><span className="hidden lg:inline">Log a session</span></a>
      <nav aria-label="Sidebar" className="mt-6 w-full">
        <ul className="space-y-1">
          {items.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <a href={tab.href} aria-current={active ? "page" : undefined} title={tab.label}
                  className="flex min-h-[44px] items-center justify-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-[#f4f5f7] lg:justify-start"
                  style={active ? { background: DEEP, color: OPTIC } : { color: INK }}>
                  <Icon size={19} strokeWidth={active ? 2.5 : 2} aria-hidden="true" /><span className="sr-only lg:not-sr-only">{tab.label}</span>
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
export function AppShell({ children, right, nav, tabs = false, wide = false, avatar }: {
  children: ReactNode; right?: ReactNode; nav?: ReactNode; tabs?: boolean; wide?: boolean;
  /** The player's photo for the Profile button in the phone tab bar. */ avatar?: ReactNode;
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
      {tabs && <SideNav account={right} />}
      <div className={tabs ? "desktop:pl-20 desktop:lg:pl-64" : undefined}>
        {/* In the app the bar is deep green so it runs straight into each screen's green header. */}
        <header className={`sticky top-0 z-20 ${tabs ? "desktop:hidden" : "border-b"}`} style={{ background: tabs ? DEEP : "rgba(255,255,255,0.94)",
          color: tabs ? WHITE : INK, backdropFilter: "blur(12px)", borderColor: BORDER, paddingTop: "env(safe-area-inset-top)" }}>
          <div className={`${width} mx-auto flex min-h-[56px] items-center justify-between gap-3 px-4 md:px-6`}>
            <a href="#/" aria-label="PicklePro home"><PickleProLogo size="sm" tone={tabs ? "dark" : "light"} /></a>
            <div className="flex min-w-0 items-center gap-2">{right}</div>
          </div>
          {nav && <nav className={`${width} mx-auto flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-sm font-semibold`}>{nav}</nav>}
        </header>
        <main id="main-content" tabIndex={-1} className={`${width} mx-auto px-4 pt-5 outline-none ${tabs ? "pb-28 md:px-6 md:pt-6 lg:px-10 lg:pt-8 desktop:pb-12" : "pb-10 md:px-6"}`}>{children}</main>
        {!tabs && <footer className="px-4 pb-6 text-center text-xs" style={{ color: WHITE_SUB }}>
          PicklePro research prototype. Video findings depend on visibility and have not yet been validated on real footage.
        </footer>}
      </div>
      {tabs && <BottomTabs avatar={avatar} />}
    </div>
  );
}
