import { supabase } from "@/integrations/supabase/client";
import type { Budget, BudgetCategory } from "@/types";

export async function getBudget(familyId: string, month: number, year: number) {
  const { data, error } = await supabase
    .from("budgets")
    .select("id, family_id, month, year, total_limit")
    .eq("family_id", familyId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();
  if (error) throw error;
  return (data as Budget | null) ?? null;
}

export async function upsertBudget(
  familyId: string,
  month: number,
  year: number,
  totalLimit: number,
) {
  const { data, error } = await supabase
    .from("budgets")
    .upsert(
      { family_id: familyId, month, year, total_limit: totalLimit },
      { onConflict: "family_id,month,year" },
    )
    .select("id, family_id, month, year, total_limit")
    .single();
  if (error) throw error;
  return data as Budget;
}

export async function deleteBudget(budgetId: string) {
  const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
  if (error) throw error;
}

export async function listBudgetCategories(budgetId: string) {
  const { data, error } = await supabase
    .from("budget_categories")
    .select("id, budget_id, category, limit_amount")
    .eq("budget_id", budgetId)
    .order("category");
  if (error) throw error;
  return (data ?? []) as BudgetCategory[];
}

export async function upsertBudgetCategory(
  budgetId: string,
  category: string,
  limitAmount: number,
) {
  const { error } = await supabase
    .from("budget_categories")
    .upsert(
      { budget_id: budgetId, category, limit_amount: limitAmount },
      { onConflict: "budget_id,category" },
    );
  if (error) throw error;
}

export async function deleteBudgetCategory(id: string) {
  const { error } = await supabase.from("budget_categories").delete().eq("id", id);
  if (error) throw error;
}