import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { BORDER, GREEN, INK, PAPER, WHITE, WHITE_DIM } from "../theme";
import { BRAND_NAME } from "../brand";

const DISMISS_KEY = "picklepro.installTip.dismissed";
type InstallPrompt = Event & { prompt: () => Promise<void> };

function dismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}
function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * A browser tab always shows the browser's own bars. Added to the home screen, PicklePro opens
 * full screen like an app, so phones that are not doing that yet get a short, dismissible tip.
 */
export function InstallTip() {
  const [hidden, setHidden] = useState(() => dismissed() || isStandalone());
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (hidden || (!isIOS() && !prompt)) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* keep for this visit */ } };
  return (
    <aside aria-label={`Use ${BRAND_NAME} full screen`} className="flex items-start gap-3 rounded-[var(--radius-lg)] p-4 pr-2" style={{ background: WHITE, border: `1px solid ${BORDER}`, color: INK }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]" style={{ background: PAPER, color: GREEN }}><Share size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Use {BRAND_NAME} full screen</p>
        {prompt
          ? <button type="button" onClick={() => void prompt.prompt().then(close)} className="mt-2 min-h-[44px] rounded-[var(--radius-md)] px-4 text-sm font-bold" style={{ border: `1px solid ${BORDER}`, color: INK }}>Install the app</button>
          : <p className="mt-0.5" style={{ color: WHITE_DIM }}>In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>}
      </div>
      <button type="button" onClick={close} aria-label="Dismiss tip" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ color: WHITE_DIM }}><X size={18} aria-hidden="true" /></button>
    </aside>
  );
}
