"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { missingSupabaseMessage, supabase } from "@/lib/supabase-browser";
import { getMyProfile, type Profile } from "@/lib/supabase-rest";

type AdminContextValue = {
  token: string | null;
  me: Profile | null;
  loading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setError(missingSupabaseMessage);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      const nextToken = data.session.access_token;
      const profile = await getMyProfile(nextToken, data.session.user.id);

      if (!profile) {
        throw new Error("No profile row found for the signed-in user.");
      }

      setToken(nextToken);
      setMe(profile);
    } catch (sessionError) {
      setToken(null);
      setMe(null);
      setError(sessionError instanceof Error ? sessionError.message : "Failed to restore session.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/login");
  }, [router]);

  const value = useMemo<AdminContextValue>(
    () => ({
      token,
      me,
      loading,
      error,
      isSuperAdmin: Boolean(me?.is_superadmin),
      refreshSession,
      signOut,
    }),
    [error, loading, me, refreshSession, signOut, token],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within AdminProvider.");
  }
  return context;
}
