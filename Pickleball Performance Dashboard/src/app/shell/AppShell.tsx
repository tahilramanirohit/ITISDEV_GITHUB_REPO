import { useEffect, useState, type ReactNode } from "react";
import { INK, NAVY, PAGE_BG, WHITE, LAVENDER } from "../theme";
import { PickleProLogo } from "./primitives";

const TEXT_SIZE_KEY = "picklepro.largeText";

function readLargeText(): boolean {
  try {
    return window.localStorage.getItem(TEXT_SIZE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Scales every rem-based size on the page, remembered on this device. */
export function LargeTextToggle() {
  const [large, setLarge] = useState(readLargeText);
  useEffect(() => {
    document.documentElement.style.fontSize = large ? "118.75%" : "";
    try {
      window.localStorage.setItem(TEXT_SIZE_KEY, large ? "1" : "0");
    } catch {
      // Storage can be blocked; the setting then lasts for this visit only.
    }
  }, [large]);
  return (
    <button type="button" aria-pressed={large} onClick={() => setLarge((v) => !v)}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold min-h-[40px]"
      style={{ color: WHITE, border: `1px solid ${large ? LAVENDER : "#64718e"}`, background: large ? "#26365a" : "transparent" }}>
      <span aria-hidden="true" style={{ fontSize: "0.8em" }}>A</span><span aria-hidden="true" style={{ fontSize: "1.2em" }}>A</span>
      {large ? "Normal text" : "Larger text"}
    </button>
  );
}

export function AppShell({ children, right, nav }: { children: ReactNode; right?: ReactNode; nav?: ReactNode }) {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", color: INK, fontFamily: "'Inter',sans-serif" }}>
      {/* Sticky only on wider screens: on a phone the header would cover much of the page. */}
      <header className="sm:sticky top-0 z-20 border-b" style={{ background: NAVY, borderColor: "#354262" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#/" aria-label="PicklePro home"><PickleProLogo size="sm" tone="dark" /></a>
            {nav && <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold" style={{ color: WHITE }}>{nav}</nav>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LargeTextToggle />
            {right}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      <footer className="border-t py-4 px-6 text-sm" style={{ background: NAVY, borderColor: "#354262", color: LAVENDER }}>
        <div className="max-w-6xl mx-auto">
          PicklePro research prototype. Video findings depend on visibility and have not yet been validated on real footage.
        </div>
      </footer>
    </div>
  );
}
