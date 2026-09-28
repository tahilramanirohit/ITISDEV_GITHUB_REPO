import { Check } from "lucide-react";
import { BORDER, NEON, NEON_D, WHITE, WHITE_DIM } from "../theme";

const STEPS = [
  { label: "Choose a focus", detail: "What do you want to improve?" },
  { label: "Upload a video", detail: "Handheld or fixed camera" },
  { label: "Review feedback", detail: "See what the video supports" },
] as const;

export function JourneySteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Your video review steps" className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((step, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        const done = number < current;
        const active = number === current;
        return (
          <li key={step.label} aria-current={active ? "step" : undefined}
            className="flex items-start gap-3 rounded-xl p-3"
            style={{ background: active ? `${NEON}14` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? `${NEON}80` : BORDER}` }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: active || done ? NEON : "rgba(255,255,255,0.1)", color: active || done ? NEON_D : WHITE_DIM }}>
              {done ? <Check size={17} aria-label="Done" /> : number}
            </span>
            <span>
              <span className="block text-sm font-semibold" style={{ color: active ? WHITE : WHITE_DIM }}>{step.label}</span>
              <span className="block text-xs mt-0.5" style={{ color: WHITE_DIM }}>{step.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
