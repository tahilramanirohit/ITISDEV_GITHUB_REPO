import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type AuthState = { status: "loading" } | { status: "signed_out" } |
  { status: "recovery"; session: Session } | { status: "signed_in"; session: Session };

export function useAuth(sb: SupabaseClient): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (active) setState((current) => current.status === "recovery" ? current :
        data.session ? { status: "signed_in", session: data.session } : { status: "signed_out" });
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      setState(session
        ? { status: event === "PASSWORD_RECOVERY" ? "recovery" : "signed_in", session }
        : { status: "signed_out" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);
  return state;
}
