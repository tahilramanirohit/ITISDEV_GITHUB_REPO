import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initials } from "../../lib/api/players";
import { profilePhotoUrl } from "../../lib/api/profilePhoto";
import { INK, OPTIC, WHITE } from "../theme";

/** The player's photo, or the initials of their name on yellow when there is none. */
export function ProfileAvatar({ sb, path, name, size = 80, preview, ring = 4, decorative = false }: {
  sb: SupabaseClient; path?: string | null; name: string; size?: number; preview?: string | null;
  /** White border width. */ ring?: number;
  /** True when a surrounding control already names it (e.g. the Profile button). */ decorative?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (path) profilePhotoUrl(sb, path).then((u) => { if (active) setUrl(u); }).catch(() => {});
    return () => { active = false; };
  }, [sb, path]);
  const src = preview ?? url;
  const letters = name.trim() ? initials(name) : "P";
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.34, background: OPTIC, color: INK, border: `${ring}px solid ${WHITE}` }}>
      {src ? <img src={src} alt={decorative ? "" : `${name || "Player"}'s profile photo`} className="h-full w-full object-cover" />
        : <span role={decorative ? undefined : "img"} aria-label={decorative ? undefined : name || "Player"} aria-hidden={decorative || undefined}>{letters}</span>}
    </span>
  );
}
