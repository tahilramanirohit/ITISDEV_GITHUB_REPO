import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { ACCENT_INK, INK, INK_2 } from "../theme";
import { cardStyle, pressable } from "./primitives";

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
    <aside aria-label="Use PicklePro full screen" className="flex items-start gap-3 rounded-[14px] p-4 pr-2" style={cardStyle}>
      <Share size={18} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: ACCENT_INK }} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Use PicklePro full screen</p>
        {prompt
          ? <button type="button" onClick={() => void prompt.prompt().then(close)} className={`mt-2 min-h-[44px] rounded-[12px] px-4 text-sm font-bold ${pressable}`} style={{ background: "var(--pp-strong)", color: "var(--pp-on-strong)" }}>Install the app</button>
          : <p className="mt-0.5 leading-relaxed" style={{ color: INK_2 }}>In Safari, tap <b style={{ color: INK }}>Share</b>, then <b style={{ color: INK }}>Add to Home Screen</b>. It then opens full screen from your home screen.</p>}
      </div>
      <button type="button" onClick={close} aria-label="Dismiss tip" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ color: INK_2 }}><X size={18} aria-hidden="true" /></button>
    </aside>
  );
}
