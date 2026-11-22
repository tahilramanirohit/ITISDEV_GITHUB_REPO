/**
 * The "create a session" button's icon: a pickleball with a "+" inside (professor's notes,
 * 22 Nov: "change create session from + to a pickleball"). Same yellow ball as the rating
 * button, so the app's two main actions look related. Decorative: the link around it is
 * labelled "Log a game".
 */
export function PickleballPlus({ size = 28 }: { size?: number }) {
  const holes = [[32, 9], [17, 15], [47, 15], [10, 30], [54, 30], [14, 46], [50, 46], [32, 55]];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="32" cy="32" r="30" fill="#f6d33c" stroke="#c9a400" strokeWidth="2" />
      {holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="#c9a400" opacity="0.85" />)}
      <ellipse cx="22" cy="16" rx="7" ry="3.5" fill="#fff" opacity="0.4" transform="rotate(-25 22 16)" />
      <path d="M32 20.5 v23 M20.5 32 h23" stroke="#16271e" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}
