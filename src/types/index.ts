export type FamilyRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface Profile {
  id: string;
  name: string;
  email: string;
}

export interface Family {
  id: string;
  name: string;
  owner_id: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string | null;
  display_name: string;
  role: FamilyRole;
  created_at: string;
}

export interface Budget {
  id: string;
  family_id: string;
  month: number;
  year: number;
  total_limit: number;
}

export interface BudgetCategory {
  id: string;
  budget_id: string;
  category: string;
  limit_amount: number;
}

export interface Expense {
  id: string;
  family_id: string;
  user_id: string;
  amount: number;
  category: string;
  date: string;
  description: string;
  family_member: string;
  created_at: string;
}

export interface ExpenseInput {
  amount: number;
  category: string;
  date: string;
  description: string;
  familyMember: string;
}