import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/http-error";
import type { AuthContext } from "@/lib/authz";

export async function assertCategoryInFamily(
  auth: AuthContext,
  categoryId: string,
  requireActive = true,
) {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      familyId: auth.familyId,
      ...(requireActive ? { archivedAt: null } : {}),
    },
  });
  if (!category) throw notFound("Category not found");
  return category;
}

export async function assertMemberInFamily(auth: AuthContext, memberId: string) {
  const member = await prisma.familyMember.findFirst({
    where: { id: memberId, familyId: auth.familyId },
  });
  if (!member) throw notFound("Family member not found");
  return member;
}

export async function assertBudgetInFamily(auth: AuthContext, budgetId: string) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, familyId: auth.familyId },
  });
  if (!budget) throw notFound("Budget not found");
  return budget;
}
