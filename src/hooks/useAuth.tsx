import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapUser, getMembership, getProfile } from "@/services/family";
import type { Family, FamilyRole, Profile } from "@/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  family: Family | null;
  role: FamilyRole | null;
  loading: boolean;
  canEdit: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [role, setRole] = useState<FamilyRole | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null);
      setFamily(null);
      setRole(null);
      setLoading(false);
      return;
    }
    try {
      const meta = activeSession.user.user_metadata as { name?: string } | undefined;
      await bootstrapUser(meta?.name ?? "", activeSession.user.email ?? "");
      const [nextProfile, membership] = await Promise.all([
        getProfile(activeSession.user.id),
        getMembership(activeSession.user.id),
      ]);
      setProfile(nextProfile);
      setFamily(membership?.family ?? null);
      setRole((membership?.membership.role as FamilyRole) ?? null);
    } catch (error) {
      console.error("Failed to load account", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(true);
      setTimeout(() => {
        void hydrate(nextSession);
      }, 0);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void hydrate(data.session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    family,
    role,
    loading,
    canEdit: role !== null && role !== "VIEWER",
    refresh: async () => {
      const { data } = await supabase.auth.getSession();
      await hydrate(data.session);
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}