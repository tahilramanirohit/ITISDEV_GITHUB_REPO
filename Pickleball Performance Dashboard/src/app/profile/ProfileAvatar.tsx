import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { profilePhotoUrl } from "../../lib/api/profilePhoto";
import { INK, OPTIC, WHITE } from "../theme";

/** The player's photo, or their first initial on yellow when there is none. */
export function ProfileAvatar({ sb, path, name, size = 80, preview }: {
  sb: SupabaseClient; path?: string | null; name: string; size?: number; preview?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (path) profilePhotoUrl(sb, path).then((u) => { if (active) setUrl(u); }).catch(() => {});
    return () => { active = false; };
  }, [sb, path]);
  const src = preview ?? url;
  const letter = (name || "P").trim().slice(0, 1).toUpperCase();
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.38, background: OPTIC, color: INK, border: `4px solid ${WHITE}` }}>
      {src ? <img src={src} alt={`${name || "Player"}'s profile photo`} className="h-full w-full object-cover" /> : <span aria-hidden="true">{letter}</span>}
    </span>
  );
}
