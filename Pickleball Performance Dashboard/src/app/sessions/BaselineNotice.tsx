import { ACCENT_INK, ACTION, CHECK, INK, INK_2, SURFACE, SURFACE_2, WARN } from "../theme";

/** A court filmed from behind the baseline: all four corners and both baselines in frame. */
function GoodAngle() {
  return (
    <svg viewBox="0 0 140 72" role="img" aria-label="Good: filmed from behind the baseline with the whole court visible" className="block h-16 w-full rounded-[10px]" style={{ background: "#3f7a4a" }}>
      <path d="M44 8 H96 L132 66 H8 Z" fill="#2f5d8a" />
      <g fill="none" stroke="#fff" strokeWidth="1.5"><path d="M44 8 H96 L132 66 H8 Z" /><path d="M70 8 V24 M70 44 V66 M35 24 H105 M23 44 H117" /></g>
      <rect x="28" y="32" width="84" height="4" fill="#0e1a13" opacity=".7" />
      {[[44, 8], [96, 8], [132, 66], [8, 66]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill={ACTION} stroke="#0e1a13" strokeWidth="1.5" />)}
    </svg>
  );
}

/** A court filmed from the side: flat, with the far half hidden. */
function SideAngle() {
  return (
    <svg viewBox="0 0 140 72" role="img" aria-label="Not this: filmed from the side, the court looks flat" className="block h-16 w-full rounded-[10px]" style={{ background: "#2b3d32" }}>
      <rect width="140" height="40" fill="#22342a" />
      <polygon points="4,62 136,62 120,50 20,50" fill="#2f5d8a" stroke="#fff" strokeWidth="1.5" />
      <line x1="70" y1="38" x2="70" y2="62" stroke="#0e1a13" strokeWidth="3" />
      <circle cx="122" cy="18" r="10" fill={WARN} />
      <path d="M117.5 13.5l9 9M126.5 13.5l-9 9" stroke="#1f1205" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The notice shown before a video is chosen: film from behind the baseline with the
 * whole court in frame, or the court map and shot list cannot be worked out.
 */
export function BaselineNotice({ exampleHref = "#/example" }: { exampleHref?: string }) {
  return (
    <section role="note" aria-label="Before you upload" className="space-y-2.5 rounded-[18px] p-3" style={{ background: SURFACE, border: `2px solid ${ACTION}` }}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[15px] font-black" style={{ background: ACTION, color: "#1f1a05" }}>!</span>
        <div>
          <p className="text-[15px] font-extrabold" style={{ color: INK }}>Film from behind the baseline</p>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: INK_2 }}>
            Put the camera behind the baseline, head height or higher, with the <b style={{ color: INK }}>whole court</b> in frame: both baselines and all 4 corners. Otherwise we can't track where you stood.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <figure><GoodAngle /><figcaption className="mt-1 text-[11px] font-bold" style={{ color: CHECK }}>✓ Behind the baseline</figcaption></figure>
        <figure><SideAngle /><figcaption className="mt-1 text-[11px] font-bold" style={{ color: WARN }}>✕ From the side</figcaption></figure>
      </div>
      <p className="rounded-[10px] px-2.5 py-2 text-[13px] leading-snug" style={{ background: SURFACE_2, color: INK }}>
        <b>Video quality:</b> landscape, <b>1080p recommended</b> (720p minimum), 30 fps or more. Lower quality makes the court lines and the ball harder to find.
      </p>
      <p className="text-xs leading-snug" style={{ color: INK_2 }}>Keep the camera still for the whole clip. A fence, tripod or water bottle works. <a href={exampleHref} className="font-bold" style={{ color: ACCENT_INK }}>See an example result →</a></p>
    </section>
  );
}
