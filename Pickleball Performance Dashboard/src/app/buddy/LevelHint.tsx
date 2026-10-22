import { buddyLevel, LEVEL_HINTS } from "../../lib/api/buddy";
import { WHITE_DIM } from "../theme";

/** One line under the level choices, so "Novice" means the same thing to everyone. */
export function LevelHint({ level }: { level: string | null | undefined }) {
  const l = buddyLevel(level);
  if (!l) return null;
  return <p className="mt-1.5 w-full text-sm" style={{ color: WHITE_DIM }}>{LEVEL_HINTS[l]}.</p>;
}
