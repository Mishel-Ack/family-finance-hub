import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSessionFn, logoutFn } from "@/services/auth.server";
import { getMembership, getProfile } from "@/services/family";
import type { Family, FamilyRole, Profile } from "@/types";

interface SessionUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  session: SessionUser | null;
  user: SessionUser | null;
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
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [role, setRole] = useState<FamilyRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    try {
      const activeSession = await getSessionFn();
      if (!activeSession) {
        setSession(null);
        setProfile(null);
        setFamily(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setSession(activeSession);

      const [nextProfile, membership] = await Promise.all([
        getProfile().catch(() => null),
        getMembership().catch(() => null),
      ]);

      setProfile(nextProfile);
      setFamily(membership?.family ?? null);
      setRole((membership?.membership.role as FamilyRole) ?? null);
    } catch (error) {
      console.error("Failed to load server session", error);
      setSession(null);
      setProfile(null);
      setFamily(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session,
    profile,
    family,
    role,
    loading,
    canEdit: role !== null && role !== "VIEWER",
    refresh: async () => {
      await loadSession();
    },
    signOut: async () => {
      await logoutFn();
      setSession(null);
      setProfile(null);
      setFamily(null);
      setRole(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
