import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { BarChart3, CalendarDays, Home, Plus, UserRound } from "lucide-react";
import { BODY_FONT, BORDER, GREEN, INK, OPTIC, OPTIC_INK, PAGE_BG, WHITE, WHITE_SUB } from "../theme";
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
      style={{ color: dark ? WHITE : INK, border: `1px solid ${large ? GREEN : dark ? "#3a3f48" : BORDER}`,
        background: large ? (dark ? "#23332a" : "#e6f4ec") : "transparent" }}>
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
  { href: "#/profile", label: "Profile", icon: UserRound, match: (p: string) => p === "/profile" },
] as const;

/** Thumb-reachable tab bar, fixed to the bottom of the screen like a native app. */
function BottomTabs() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
      style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", borderColor: BORDER,
        paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <a href={tab.href} aria-current={active ? "page" : undefined}
                className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
                style={{ color: active ? INK : WHITE_SUB }}>
                {"primary" in tab
                  ? <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg"
                      style={{ background: OPTIC, color: OPTIC_INK, border: `3px solid ${WHITE}` }}><Icon size={24} strokeWidth={2.6} /></span>
                  : <Icon size={22} strokeWidth={active ? 2.5 : 2} />}
                <span>{tab.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop navigation: a fixed left sidebar replaces the bottom tabs on large screens. */
function SideNav({ account }: { account?: ReactNode }) {
  const { pathname } = useLocation();
  const items = TABS.filter((t) => !("primary" in t));
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r px-2 py-6 md:flex lg:w-64 lg:items-stretch lg:px-4" style={{ background: WHITE, borderColor: BORDER }}>
      {/* Tablets get a slim icon rail; the full sidebar starts at desktop width. */}
      <a href="#/" aria-label="PicklePro home" className="lg:px-2">
        <span className="lg:hidden"><PickleProMark /></span>
        <span className="hidden lg:block"><PickleProLogo size="sm" tone="light" /></span>
      </a>
      <a href="#/new" aria-label="Log a session" className="mt-6 flex h-12 w-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold lg:h-auto lg:min-h-[48px] lg:w-auto"
        style={{ background: OPTIC, color: OPTIC_INK }}><Plus size={20} strokeWidth={2.6} /><span className="hidden lg:inline">Log a session</span></a>
      <nav aria-label="Sidebar" className="mt-6 w-full">
        <ul className="space-y-1">
          {items.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <a href={tab.href} aria-current={active ? "page" : undefined}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold transition-colors hover:bg-[#f2f3f0] lg:min-h-[44px] lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm"
                  style={active ? { background: INK, color: WHITE } : { color: INK }}>
                  <Icon size={19} strokeWidth={active ? 2.5 : 2} />{tab.label}
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
export function AppShell({ children, right, nav, tabs = false, wide = false }: {
  children: ReactNode; right?: ReactNode; nav?: ReactNode; tabs?: boolean; wide?: boolean;
}) {
  const width = wide ? "max-w-6xl" : tabs ? "max-w-xl md:max-w-3xl lg:max-w-6xl" : "max-w-xl lg:max-w-3xl";
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", color: INK, fontFamily: BODY_FONT }}>
      {tabs && <SideNav account={right} />}
      <div className={tabs ? "md:pl-20 lg:pl-64" : undefined}>
        <header className={`sticky top-0 z-20 border-b ${tabs ? "md:hidden" : ""}`} style={{ background: "rgba(255,255,255,0.94)", backdropFilter: "blur(12px)", borderColor: BORDER,
          paddingTop: "env(safe-area-inset-top)" }}>
          <div className={`${width} mx-auto flex min-h-[56px] items-center justify-between gap-3 px-4`}>
            <a href="#/" aria-label="PicklePro home"><PickleProLogo size="sm" tone="light" /></a>
            <div className="flex min-w-0 items-center gap-2">{right}</div>
          </div>
          {nav && <nav className={`${width} mx-auto flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-sm font-semibold`}>{nav}</nav>}
        </header>
        <main className={`${width} mx-auto px-4 pt-5 ${tabs ? "pb-28 md:px-8 md:pb-12 md:pt-8" : "pb-10"}`}>{children}</main>
        {!tabs && <footer className="px-4 pb-6 text-center text-xs" style={{ color: WHITE_SUB }}>
          PicklePro research prototype. Video findings depend on visibility and have not yet been validated on real footage.
        </footer>}
      </div>
      {tabs && <BottomTabs />}
    </div>
  );
}
