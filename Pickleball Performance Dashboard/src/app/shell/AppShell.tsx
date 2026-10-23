import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { BarChart3, CalendarDays, Handshake, Home, Monitor, Moon, Plus, Sun, UserRound, UsersRound } from "lucide-react";
import {
  ACCENT_INK, ACTION, ACTION_EDGE, BODY_FONT, DANGER, INK, INK_2, INK_3, LINE, LINE_STRONG, ON_ACTION, ON_STRONG, PAGE_BG, STRONG, SURFACE, SURFACE_2,
  applyAppearance, readAppearance, type Appearance,
} from "../theme";
import { PickleProLogo, PickleProMark, pressable } from "./primitives";

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
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] px-3 py-2 text-sm font-semibold ${pressable}`}
      style={{ color: dark ? "#eef3ee" : INK, border: `1px solid ${dark ? "rgba(255,255,255,0.3)" : large ? STRONG : LINE}`,
        background: large ? (dark ? "rgba(255,255,255,0.12)" : SURFACE_2) : "transparent" }}>
      <span aria-hidden="true" style={{ fontSize: "0.8em" }}>A</span><span aria-hidden="true" style={{ fontSize: "1.2em" }}>A</span>
      {large ? "Normal text" : "Larger text"}
    </button>
  );
}

const APPEARANCE_ORDER: Appearance[] = ["system", "light", "dark"];
const APPEARANCE_LABEL: Record<Appearance, string> = { system: "Match device", light: "Light", dark: "Dark" };

/** Cycles light, dark and "match device". Settings has the same choice as a list. */
export function AppearanceToggle() {
  const [value, setValue] = useState<Appearance>(readAppearance);
  const next = APPEARANCE_ORDER[(APPEARANCE_ORDER.indexOf(value) + 1) % APPEARANCE_ORDER.length];
  const Icon = value === "light" ? Sun : value === "dark" ? Moon : Monitor;
  return (
    <button type="button" onClick={() => { applyAppearance(next); setValue(next); }}
      aria-label={`Appearance: ${APPEARANCE_LABEL[value]}. Switch to ${APPEARANCE_LABEL[next]}`} title={`Appearance: ${APPEARANCE_LABEL[value]}`}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${pressable}`} style={{ color: INK_2 }}>
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

/** A count on a tab (for example buddy requests waiting for an answer); hidden at zero. */
function Badge({ count, label }: { count?: number; label: string }) {
  if (!count) return null;
  return <>
    <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold leading-none"
      style={{ background: DANGER, color: PAGE_BG }}>{count > 9 ? "9+" : count}</span>
    <span className="sr-only">, {count} {label}</span>
  </>;
}

export type TabBadges = Partial<Record<string, number>>;

const TABS = [
  { href: "#/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "#/sessions", label: "Sessions", icon: CalendarDays, match: (p: string) => p.startsWith("/sessions") },
  { href: "#/new", label: "Log", icon: Plus, match: (p: string) => p === "/new", primary: true },
  { href: "#/progress", label: "Progress", icon: BarChart3, match: (p: string) => p === "/progress" },
  // On phones, Partners is reached from the Buddy page (seven tabs do not fit), so the Buddy tab also counts partner invites.
  { href: "#/buddy", label: "Buddy", icon: UsersRound, match: (p: string) => p === "/buddy",
    phoneMatch: (p: string) => p === "/buddy" || p === "/partners" || p.startsWith("/shared"), phoneAlsoCounts: "#/partners" },
  { href: "#/partners", label: "Partners", icon: Handshake, match: (p: string) => p === "/partners" || p.startsWith("/shared"), phone: false },
  { href: "#/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/profile") },
] as const;

/**
 * Phone tab bar: a solid bar along the bottom with an icon and a label per tab.
 * Logging a game is the one lime action; the player's photo is the Profile tab.
 */
function BottomTabs({ avatar, badges }: { avatar?: ReactNode; badges?: TabBadges }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t desktop:hidden"
      style={{ background: SURFACE, borderColor: LINE, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1.5 py-1.5">
        {TABS.filter((t) => !("phone" in t && t.phone === false)).map((tab) => {
          const active = "phoneMatch" in tab ? tab.phoneMatch(pathname) : tab.match(pathname);
          const Icon = tab.icon;
          const isProfile = tab.href === "#/profile";
          const count = (badges?.[tab.href] ?? 0) + ("phoneAlsoCounts" in tab ? badges?.[tab.phoneAlsoCounts] ?? 0 : 0);
          return (
            <li key={tab.href} className="flex-1">
              <a href={tab.href} aria-label={count ? `${tab.label}, ${count} waiting` : tab.label}
                aria-current={active ? "page" : undefined}
                className="mx-auto flex h-14 max-w-[68px] flex-col items-center justify-center gap-0.5 rounded-[10px] text-[11px] font-semibold transition-colors"
                style={{ background: active && !("primary" in tab) ? SURFACE_2 : "transparent", color: active ? INK : INK_2 }}>
                {"primary" in tab
                  ? <span className="flex h-8 w-11 items-center justify-center rounded-[10px]" style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}><Icon size={20} strokeWidth={2.6} aria-hidden="true" /></span>
                  : isProfile && avatar
                    ? <span className="rounded-full" style={{ boxShadow: active ? `0 0 0 2px ${STRONG}` : `0 0 0 1px ${LINE_STRONG}` }}>{avatar}</span>
                    : <span className="relative"><Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
                      <Badge count={count} label="waiting" /></span>}
                <span aria-hidden="true">{tab.label}</span>
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r px-3 py-6 desktop:flex lg:w-64 lg:items-stretch lg:px-4" style={{ background: SURFACE, borderColor: LINE }}>
      <a href="#/" aria-label="PicklePro home" className="lg:px-2">
        <span className="lg:hidden"><PickleProMark size={44} /></span>
        <span className="hidden lg:block"><PickleProLogo size="sm" tone="light" /></span>
      </a>
      <a href="#/new" aria-label="Log a game" title="Log a game" className={`mt-6 flex h-12 w-12 items-center justify-center gap-2 rounded-[12px] text-[0.95rem] font-bold lg:w-auto ${pressable}`}
        style={{ background: ACTION, color: ON_ACTION, border: `1px solid ${ACTION_EDGE}` }}><Plus size={20} strokeWidth={2.6} aria-hidden="true" /><span className="hidden lg:inline">Log a game</span></a>
      <nav aria-label="Sidebar" className="mt-6 w-full">
        <ul className="space-y-1">
          {items.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <a href={tab.href} aria-current={active ? "page" : undefined} title={tab.label}
                  className="flex min-h-[44px] items-center justify-center gap-3 rounded-[10px] px-3 text-sm font-semibold transition-colors hover:bg-sunken lg:justify-start"
                  style={active ? { background: SURFACE_2, color: INK } : { color: INK_2 }}>
                  <span className="relative"><Icon size={19} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" style={active ? { color: ACCENT_INK } : undefined} />
                    <Badge count={badges?.[tab.href]} label="waiting" /></span><span className="sr-only lg:not-sr-only">{tab.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto hidden w-full lg:flex lg:justify-start"><AppearanceToggle /></div>
      <div className="mt-auto lg:hidden"><AppearanceToggle /></div>
      <div className="mt-3 hidden space-y-3 px-2 lg:block">
        {account}
        <p className="text-xs leading-relaxed" style={{ color: INK_3 }}>PicklePro research prototype. Video findings have not yet been validated on real footage.</p>
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
        style={{ background: STRONG, color: ON_STRONG }}>Skip to main content</button>
      {tabs && <SideNav account={right} badges={badges} />}
      <div className={tabs ? "desktop:pl-20 desktop:lg:pl-64" : undefined}>
        <header className={`sticky top-0 z-20 border-b ${tabs ? "desktop:hidden" : ""}`} style={{ background: PAGE_BG,
          color: INK, borderColor: LINE, paddingTop: "env(safe-area-inset-top)" }}>
          <div className={`${width} mx-auto flex min-h-[60px] items-center justify-between gap-3 px-4 md:px-6`}>
            <a href="#/" aria-label="PicklePro home"><PickleProLogo size="sm" /></a>
            <div className="flex min-w-0 items-center gap-1">{tabs && <AppearanceToggle />}{right}</div>
          </div>
          {nav && <nav className={`${width} mx-auto flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-sm font-semibold`}>{nav}</nav>}
        </header>
        <main id="main-content" tabIndex={-1} className={`${width} mx-auto px-4 pt-5 outline-none ${tabs ? "pb-32 md:px-6 md:pt-6 lg:px-10 lg:pt-8 desktop:pb-12" : "pb-10 md:px-6"}`}>{children}</main>
        {!tabs && <footer className="px-4 pb-6 text-center text-xs" style={{ color: INK_3 }}>
          PicklePro research prototype. Video findings depend on visibility and have not yet been validated on real footage.
        </footer>}
      </div>
      {tabs && <BottomTabs avatar={avatar} badges={badges} />}
    </div>
  );
}
