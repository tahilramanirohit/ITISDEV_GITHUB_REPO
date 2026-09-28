import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type AuthState = { status: "loading" } | { status: "signed_out" } | { status: "signed_in"; session: Session };

export function useAuth(sb: SupabaseClient): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? { status: "signed_in", session: data.session } : { status: "signed_out" });
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: "signed_in", session } : { status: "signed_out" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);
  return state;
}
