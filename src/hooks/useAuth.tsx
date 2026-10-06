import { useEffect, useState, type ReactNode } from "react";
import { getSessionFn, logoutFn } from "@/services/auth.server";
import { getMembership, getProfile } from "@/services/family";
import { AuthContext, type AuthContextValue } from "@/hooks/auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [role, setRole] = useState<FamilyRole | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    try {
      const activeSession = await getSessionFn();
      if (!activeSession) {
        setSession(null);
        setProfile(null);
        setFamily(null);
        setRole(null);
        setDisplayName(null);
        setMemberId(null);
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
      setDisplayName(membership?.membership.display_name ?? null);
      setMemberId(membership?.membership.id ?? null);
    } catch (error) {
      console.error("Failed to load server session", error);
      setSession(null);
      setProfile(null);
      setFamily(null);
      setRole(null);
      setDisplayName(null);
      setMemberId(null);
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
    displayName,
    memberId,
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
      setDisplayName(null);
      setMemberId(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

