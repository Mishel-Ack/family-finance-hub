import { supabase } from "@/integrations/supabase/client";
import type { Expense, ExpenseInput } from "@/types";

export async function listExpenses(familyId: string, from?: string, to?: string) {
  let query = supabase
    .from("expenses")
    .select("id, family_id, user_id, amount, category, date, description, family_member, created_at")
    .eq("family_id", familyId);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function createExpense(familyId: string, userId: string, input: ExpenseInput) {
  const { error } = await supabase.from("expenses").insert({
    family_id: familyId,
    user_id: userId,
    amount: input.amount,
    category: input.category,
    date: input.date,
    description: input.description,
    family_member: input.familyMember,
  });
  if (error) throw error;
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const { error } = await supabase
    .from("expenses")
    .update({
      amount: input.amount,
      category: input.category,
      date: input.date,
      description: input.description,
      family_member: input.familyMember,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}