import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Smartphone } from "lucide-react";
import { INK, LINE, ON_STRONG, STRONG } from "../theme";
import { pressable } from "./primitives";

/** Query flag that tells the app it is running inside the desktop phone preview. */
export const PHONE_VIEW_PARAM = "phone";

const PHONE_W = 390;
const PHONE_H = 844;
const BEZEL = 10;

/** True when this page was opened inside the phone preview frame. */
export function isPhoneView(): boolean {
  try {
    return new URLSearchParams(window.location.search).has(PHONE_VIEW_PARAM);
  } catch {
    return false;
  }
}

/** Marks the page so the `desktop:` styles switch off and the phone layout shows. */
export function markPhoneView() {
  if (isPhoneView()) document.documentElement.setAttribute("data-phone-view", "");
}

function frameUrl(): string {
  const { origin, pathname, hash } = window.location;
  return `${origin}${pathname}?${PHONE_VIEW_PARAM}=1${hash}`;
}

/**
 * The phone's screen height: a real iPhone's 844, or less on a short laptop screen.
 * The width always stays 390 so the layout matches a phone. Shortening the screen
 * (instead of shrinking it with a CSS transform) keeps scrolling smooth.
 */
function useScreenHeight() {
  const fit = () => Math.max(480, Math.min(PHONE_H, window.innerHeight - 96 - BEZEL * 2));
  const [height, setHeight] = useState(fit);
  useEffect(() => {
    const onResize = () => setHeight(fit());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

function PhoneOverlay({ onClose }: { onClose: () => void }) {
  const [src] = useState(frameUrl);
  const frame = useRef<HTMLIFrameElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const height = useScreenHeight();

  // Leaving phone view keeps the screen you were on inside the phone.
  const close = () => {
    try {
      const inner = frame.current?.contentWindow?.location.hash;
      if (inner && inner !== window.location.hash) window.location.hash = inner;
    } catch {
      // The frame is the same site, so this only fails if it never loaded.
    }
    onClose();
  };

  useEffect(() => {
    back.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Stop drawing the desktop app behind the phone, so the browser only draws one app.
    const root = document.getElementById("root");
    const display = root?.style.display ?? "";
    if (root) root.style.display = "none";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      if (root) root.style.display = display;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Phone view" className="fixed inset-0 z-[60] flex flex-col items-center"
      style={{ background: "#0e1a13" }}>
      <div className="flex w-full items-center justify-between px-5 py-4">
        <button ref={back} type="button" onClick={close}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-4 text-sm font-semibold ${pressable}`}
          style={{ color: "#f2f5f1", border: "1px solid rgba(255,255,255,0.3)" }}>
          <Monitor size={18} aria-hidden="true" />Back to desktop
        </button>
        <span className="text-xs" style={{ color: "#a9b8ae" }}>Phone size · {PHONE_W} × {height}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center">
        {/* One plain bezel and one rounded screen, no scaling or blurred shadow: cheap for the browser to scroll. */}
        <div style={{ padding: BEZEL, borderRadius: 54, background: "#2b3f33" }}>
          <iframe ref={frame} src={src} title="PicklePro on a phone" width={PHONE_W} height={height}
            style={{ display: "block", border: 0, borderRadius: 44, background: "#16271e" }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Desktop only: shows the app as it looks on a phone, in a phone-sized frame. */
export function PhoneViewToggle({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (isPhoneView()) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={compact ? "Phone view" : undefined} title="See the app as it looks on a phone"
        className={`inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[12px] text-sm font-semibold ${compact ? "w-11" : "px-3"} ${pressable}`}
        style={compact ? { color: INK, border: `1px solid ${LINE}` } : { background: STRONG, color: ON_STRONG }}>
        <Smartphone size={18} aria-hidden="true" />{!compact && "Phone view"}
      </button>
      {open && <PhoneOverlay onClose={() => setOpen(false)} />}
    </>
  );
}
