import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/authz";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import type { Category, CategoryInput } from "@/types";
import { categoryCreateSchema, categoryUpdateSchema, idSchema } from "@/lib/validations";
import { httpError, notFound } from "@/lib/http-error";
import { assertCategoryInFamily } from "@/lib/guards";
import { assertSameOrigin } from "@/lib/http-utils";

export async function ensureDefaultCategories(
  tx: Prisma.TransactionClient | typeof prisma,
  familyId: string,
) {
  const existingCount = await tx.category.count({ where: { familyId } });
  if (existingCount === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await tx.category.create({
        data: {
          familyId,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          isDefault: true,
        },
      });
    }
  }
}

export const listCategoriesFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");
  await ensureDefaultCategories(prisma, auth.familyId);

  const items = await prisma.category.findMany({
    where: {
      familyId: auth.familyId,
      archivedAt: null,
    },
    orderBy: { name: "asc" },
  });

  return items.map(
    (c) =>
      ({
        id: c.id,
        family_id: c.familyId,
        name: c.name,
        color: c.color,
        icon: c.icon,
        is_default: c.isDefault,
        archived_at: c.archivedAt ? c.archivedAt.toISOString() : null,
        created_at: c.createdAt.toISOString(),
      }) as Category,
  );
});

export const createCategoryFn = createServerFn({ method: "POST" })
  .validator(categoryCreateSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("category:manage");
    const name = data.name.trim();
    if (!name) throw new Error("Category name is required");

    const existing = await prisma.category.findUnique({
      where: {
        familyId_name: {
          familyId: auth.familyId,
          name,
        },
      },
    });

    if (existing) {
      if (existing.archivedAt) {
        // Unarchive
        return await prisma.category.update({
          where: { id: existing.id },
          data: {
            archivedAt: null,
            color: data.color || existing.color,
            icon: data.icon || existing.icon,
          },
        });
      }
      throw new Error("Category with this name already exists");
    }

    return await prisma.category.create({
      data: {
        familyId: auth.familyId,
        name,
        color: data.color || "#6b7280",
        icon: data.icon || "Tag",
        isDefault: false,
      },
    });
  });

export const updateCategoryFn = createServerFn({ method: "POST" })
  .validator(categoryUpdateSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("category:manage");

    await assertCategoryInFamily(auth, data.id, false);

    const updateData: { name?: string; color?: string; icon?: string } = {};
    if (data.input.name && data.input.name.trim()) {
      updateData.name = data.input.name.trim();
    }
    if (data.input.color) updateData.color = data.input.color;
    if (data.input.icon) updateData.icon = data.input.icon;

    const updated = await prisma.category.updateMany({
      where: { id: data.id, familyId: auth.familyId },
      data: updateData,
    });
    if (updated.count === 0) throw notFound("Category not found");
    return prisma.category.findFirst({ where: { id: data.id, familyId: auth.familyId } });
  });

export const archiveCategoryFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("category:manage");

    const archived = await prisma.category.updateMany({
      where: { id, familyId: auth.familyId },
      data: { archivedAt: new Date() },
    });
    if (archived.count === 0) throw notFound("Category not found");
  });

export const deleteCategoryFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("category:manage");
    await assertCategoryInFamily(auth, id, false);
    const usedCount = await prisma.expense.count({
      where: { familyId: auth.familyId, categoryId: id },
    });
    if (usedCount > 0) {
      throw httpError("This category has expenses. Archive it instead.", 409);
    }
    try {
      const deleted = await prisma.category.deleteMany({
        where: { id, familyId: auth.familyId },
      });
      if (deleted.count === 0) throw notFound("Category not found");
    } catch (error: unknown) {
      if (error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === "P2003") {
        throw httpError("This category has expenses. Archive it instead.", 409);
      }
      throw error;
    }
  });

export function listCategories() {
  return listCategoriesFn();
}

export function createCategory(input: CategoryInput) {
  return createCategoryFn({ data: input });
}

export function updateCategory(id: string, input: Partial<CategoryInput>) {
  return updateCategoryFn({ data: { id, input } });
}

export function archiveCategory(id: string) {
  return archiveCategoryFn({ data: id });
}

export function deleteCategory(id: string) {
  return deleteCategoryFn({ data: id });
}
