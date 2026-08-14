import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SessionUser } from "@/services/auth.server";
import { bootstrapUser, getMembership, getProfile } from "@/services/family";
import type { Family, FamilyRole, Profile } from "@/types";

const AUTH_KEY = "fb_user_session";

interface AuthContextValue {
  session: SessionUser | null;
  user: SessionUser | null;
  profile: Profile | null;
  family: Family | null;
  role: FamilyRole | null;
  loading: boolean;
  canEdit: boolean;
  saveSession: (user: SessionUser) => Promise<void>;
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

  const hydrate = async (activeSession: SessionUser | null) => {
    if (!activeSession) {
      setProfile(null);
      setFamily(null);
      setRole(null);
      setLoading(false);
      return;
    }
    try {
      await bootstrapUser(activeSession.id, activeSession.name, activeSession.email);
      const [nextProfile, membership] = await Promise.all([
        getProfile(activeSession.id),
        getMembership(activeSession.id),
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

  const loadSession = async () => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      const user: SessionUser | null = raw ? JSON.parse(raw) : null;
      setSession(user);
      await hydrate(user);
    } catch {
      setSession(null);
      await hydrate(null);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const saveSession = async (user: SessionUser) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    setSession(user);
    await hydrate(user);
  };

  const value: AuthContextValue = {
    session,
    user: session,
    profile,
    family,
    role,
    loading,
    canEdit: role !== null && role !== "VIEWER",
    saveSession,
    refresh: async () => {
      await loadSession();
    },
    signOut: async () => {
      localStorage.removeItem(AUTH_KEY);
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