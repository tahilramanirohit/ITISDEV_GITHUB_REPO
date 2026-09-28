import type { ReactNode } from "react";
import { BORDER, PAGE_BG, WHITE, WHITE_DIM, WHITE_SUB } from "../theme";
import { PickleProLogo } from "./primitives";

export function AppShell({ children, right, nav }: { children: ReactNode; right?: ReactNode; nav?: ReactNode }) {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh", color: WHITE, fontFamily: "'Inter',sans-serif" }}>
      <header className="sticky top-0 z-20 border-b" style={{ background: "rgba(7,26,62,0.95)", backdropFilter: "blur(12px)", borderColor: BORDER }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="#/" aria-label="PicklePro home"><PickleProLogo /></a>
            {nav && <nav className="flex items-center gap-4 text-xs font-semibold" style={{ color: WHITE_DIM }}>{nav}</nav>}
          </div>
          {right}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      <footer className="border-t py-4 px-6 text-[10px]" style={{ borderColor: BORDER, color: WHITE_SUB }}>
        <div className="max-w-6xl mx-auto">
          PicklePro research prototype. Metrics are whole-clip estimates from a fixed camera; accuracy on real footage has not yet been evaluated.
        </div>
      </footer>
    </div>
  );
}
