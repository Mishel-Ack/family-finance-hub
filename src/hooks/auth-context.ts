import { createContext, useContext } from "react";
import type { Family, FamilyRole, Profile } from "@/types";

interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthContextValue {
  session: SessionUser | null;
  user: SessionUser | null;
  profile: Profile | null;
  family: Family | null;
  role: FamilyRole | null;
  displayName: string | null;
  memberId: string | null;
  loading: boolean;
  canEdit: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
