import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile, type PlayerProfile } from "../../lib/api/profile";
import { ProfileAvatar } from "./ProfileAvatar";

export const PROFILE_UPDATED = "picklepro:profile-updated";

/** Tells the navigation bar to reload the photo and name after they change. */
export function announceProfileUpdate() {
  window.dispatchEvent(new Event(PROFILE_UPDATED));
}

/** The player's own photo (or initials) for the Profile button, like Facebook and Instagram. */
export function NavAvatar({ sb, userId, size = 30 }: { sb: SupabaseClient; userId: string; size?: number }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => getProfile(sb, userId).then((p) => { if (active) setProfile(p); }).catch(() => {});
    void load();
    window.addEventListener(PROFILE_UPDATED, load);
    return () => { active = false; window.removeEventListener(PROFILE_UPDATED, load); };
  }, [sb, userId]);
  return <ProfileAvatar sb={sb} path={profile?.avatar_path} name={profile?.display_name ?? ""} size={size} ring={2} decorative />;
}
