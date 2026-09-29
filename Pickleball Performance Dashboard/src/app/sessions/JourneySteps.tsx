import { Check } from "lucide-react";
import { COBALT, INK, LAVENDER, WHITE } from "../theme";

const STEPS = [
  { label: "Choose a focus", detail: "What do you want to improve?" },
  { label: "Upload a video", detail: "Handheld or fixed camera" },
  { label: "Review feedback", detail: "See what the video supports" },
] as const;

export function JourneySteps({ current, tone = "dark" }: { current: 1 | 2 | 3; tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <ol aria-label="Your video review steps" className={`grid sm:grid-cols-3 ${light ? "" : "gap-3"}`}
      style={{ borderTop: light ? "1px solid #bfc2c7" : undefined }}>
      {STEPS.map((step, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        const done = number < current;
        const active = number === current;
        return (
          <li key={step.label} aria-current={active ? "step" : undefined}
            className={`flex items-start gap-3 p-4 ${light ? "border-b sm:border-r" : "rounded-xl"}`}
            style={light ? { borderColor: "#bfc2c7", background: active ? "#eaecff" : "transparent" }
              : { background: active ? "#26365a" : "#1b2947", border: `1px solid ${active ? LAVENDER : "#56617a"}` }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: light ? (active || done ? COBALT : "#e1e3e8") : (active || done ? LAVENDER : "#425170"),
                color: light ? (active || done ? WHITE : INK) : (active || done ? INK : WHITE) }}>
              {done ? <Check size={17} aria-label="Done" /> : number}
            </span>
            <span>
              <span className="block text-sm font-semibold" style={{ color: light ? INK : WHITE }}>{step.label}</span>
              <span className="block text-sm mt-0.5" style={{ color: light ? "#596372" : "#c2cad9" }}>{step.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
