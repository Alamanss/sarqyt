"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type Org, type Profile } from "./supabase";

type AuthState = { loading: boolean; profile: Profile | null; org: Org | null; refresh: () => Promise<void>; signOut: () => Promise<void> };
const Ctx = createContext<AuthState>({ loading: true, profile: null, org: null, refresh: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Org | null>(null);

  async function load() {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) { setProfile(null); setOrg(null); setLoading(false); return; }
    const { data: p } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    setProfile((p as Profile) ?? null);
    if (p?.org_id) {
      const { data: o } = await supabase.from("organizations").select("*").eq("id", p.org_id).maybeSingle();
      setOrg((o as Org) ?? null);
    } else setOrg(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") setTimeout(load, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); setProfile(null); setOrg(null); };
  return <Ctx.Provider value={{ loading, profile, org, refresh: load, signOut }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
