"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const missingConfig = [!url ? "NEXT_PUBLIC_SUPABASE_URL" : null, !key ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : null].filter((x): x is string => Boolean(x));
const supabase = url && key ? createClient(url, key) : null;

export type AuthUser = { userId: string; username: string; email: string; groups: string[]; isAdmin: boolean; isDemo: boolean };
export function hasAdminGroup(groups: unknown) { return Array.isArray(groups) && (groups.includes("admin") || groups.includes("demo_admin")); }
function authUser(user: User | null): AuthUser | null {
  if (!user) return null;
  // app_metadata is controlled by administrators; user_metadata is editable.
  const groups = Array.isArray(user.app_metadata?.groups) ? user.app_metadata.groups : [];
  return {userId: user.id, username: user.user_metadata?.name || user.email || "", email: user.email || "", groups, isAdmin: hasAdminGroup(groups), isDemo: user.app_metadata?.demo === true};
}
type AuthContextValue = {
  user: AuthUser | null; loading: boolean; configured: boolean; missingConfig: string[];
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<boolean>;
  confirm: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
function client() { if (!supabase) throw new Error("Sign-in is temporarily unavailable."); return supabase; }
export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const refreshUser = useCallback(async () => {
    const {data, error} = await client().auth.getUser();
    if (error) throw error;
    setUser(authUser(data.user));
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({data}) => { if (active) { setUser(authUser(data.session?.user || null)); setLoading(false); } });
    const {data} = supabase.auth.onAuthStateChange((_event, session) => { setUser(authUser(session?.user || null)); setLoading(false); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading, configured: Boolean(supabase), missingConfig,
    login: async (email, password) => { const {error} = await client().auth.signInWithPassword({email, password}); if (error) throw error; await refreshUser(); },
    register: async (fullName, email, password) => {
      const {data, error} = await client().auth.signUp({email, password, options: {data: {name: fullName.trim()}, emailRedirectTo: window.location.origin}});
      if (error) throw error;
      if (data.session) await refreshUser();
      return Boolean(data.session);
    },
    confirm: async (email, code) => { const {error} = await client().auth.verifyOtp({email, token: code, type: "email"}); if (error) throw error; await refreshUser(); },
    logout: async () => { const {error} = await client().auth.signOut(); if (error) throw error; setUser(null); },
  }), [user, loading, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider."); return value; }
export async function getAccessToken() { if (!supabase) return null; const {data, error} = await supabase.auth.getSession(); if (error) throw error; return data.session?.access_token || null; }
