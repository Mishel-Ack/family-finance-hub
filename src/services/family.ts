import { supabase } from "@/integrations/supabase/client";
import type { Family, FamilyMember, Profile } from "@/types";

export async function bootstrapUser(name: string, email: string) {
  const { data, error } = await supabase.rpc("bootstrap_user", {
    _name: name,
    _email: email,
  });
  if (error) throw error;
  return data as string;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function updateProfileName(userId: string, name: string) {
  const { error } = await supabase.from("profiles").update({ name }).eq("id", userId);
  if (error) throw error;
}

export async function getMembership(userId: string) {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, family_id, user_id, display_name, role, created_at, families(id, name, owner_id)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as FamilyMember & { families: Family };
  return { membership: row as FamilyMember, family: row.families };
}

export async function listFamilyMembers(familyId: string) {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, family_id, user_id, display_name, role, created_at")
    .eq("family_id", familyId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as FamilyMember[];
}

export async function addFamilyMember(familyId: string, displayName: string, role: string) {
  const { error } = await supabase
    .from("family_members")
    .insert({ family_id: familyId, display_name: displayName, role: role as never });
  if (error) throw error;
}

export async function removeFamilyMember(id: string) {
  const { error } = await supabase.from("family_members").delete().eq("id", id);
  if (error) throw error;
}

export async function renameFamily(familyId: string, name: string) {
  const { error } = await supabase.from("families").update({ name }).eq("id", familyId);
  if (error) throw error;
}