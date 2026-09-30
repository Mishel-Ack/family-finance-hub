import { Role } from "@/lib/authz";

// Prisma Enum mapping
export enum RoleEnum {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER",
}

export type FamilyRole = Role;

export interface Profile {
  id: string;
  name: string;
  email: string;
}

export interface Family {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string | null;
  display_name: string;
  role: FamilyRole;
  created_at?: string;
}

export interface Category {
  id: string;
  family_id: string;
  name: string;
  color: string;
  icon: string;
  is_default: boolean;
  archived_at: string | null;
  created_at?: string;
}

export interface Budget {
  id: string;
  family_id: string;
  month: number;
  year: number;
  total_limit_paise: number;
  // UI fallback helper
  total_limit: number;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category_id: string;
  category_name?: string;
  category_color?: string;
  category_icon?: string;
  limit_amount_paise: number;
  // UI fallback helper
  limit_amount: number;
}

export interface Expense {
  id: string;
  family_id: string;
  user_id: string;
  member_id: string | null;
  amount_paise: number;
  // UI fallback helper
  amount: number;
  category_id: string;
  category_name?: string;
  category_color?: string;
  category_icon?: string;
  category?: string; // legacy fallback
  date: string;
  description: string;
  family_member: string; // legacy display string or resolved member name
  created_at?: string;
}

export interface ExpenseInput {
  amount: number; // In Rupees from UI input
  categoryId: string;
  memberId?: string | null;
  date: string;
  description?: string;
}

export interface CategoryInput {
  name: string;
  color?: string;
  icon?: string;
}
