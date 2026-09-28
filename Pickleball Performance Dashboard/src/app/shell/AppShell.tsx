import type { ReactNode } from "react";
import { INK, NAVY, PAGE_BG, WHITE, LAVENDER } from "../theme";
import { PickleProLogo } from "./primitives";

export function AppShell({ children, right, nav }: { children: ReactNode; right?: ReactNode; nav?: ReactNode }) {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", color: INK, fontFamily: "'Inter',sans-serif" }}>
      <header className="sticky top-0 z-20 border-b" style={{ background: NAVY, borderColor: "#354262" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#/" aria-label="PicklePro home"><PickleProLogo size="sm" tone="dark" /></a>
            {nav && <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold" style={{ color: WHITE }}>{nav}</nav>}
          </div>
          {right}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      <footer className="border-t py-4 px-6 text-[10px]" style={{ background: NAVY, borderColor: "#354262", color: LAVENDER }}>
        <div className="max-w-6xl mx-auto">
          PicklePro research prototype. Video findings depend on visibility and have not yet been validated on real footage.
        </div>
      </footer>
    </div>
  );
}
