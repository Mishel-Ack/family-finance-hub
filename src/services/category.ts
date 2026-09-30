import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/authz";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import type { Prisma } from "@prisma/client";
import type { Category, CategoryInput } from "@/types";
import { z } from "zod";
import { notFound } from "@/lib/http-error";

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
  .validator(
    z.object({
      name: z.string().trim().min(1).max(40),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      icon: z.string().max(40).optional(),
    }),
  )
  .handler(async ({ data }) => {
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
  .validator(
    z.object({
      id: z.string().min(1),
      input: z.object({
        name: z.string().trim().min(1).max(40).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        icon: z.string().max(40).optional(),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await requireMember("category:manage");

    const cat = await prisma.category.findFirst({
      where: { id: data.id, familyId: auth.familyId },
    });

    if (!cat) {
      throw notFound("Category not found");
    }

    const updateData: { name?: string; color?: string; icon?: string } = {};
    if (data.input.name && data.input.name.trim()) {
      updateData.name = data.input.name.trim();
    }
    if (data.input.color) updateData.color = data.input.color;
    if (data.input.icon) updateData.icon = data.input.icon;

    return await prisma.category.update({
      where: { id: data.id },
      data: updateData,
    });
  });

export const archiveCategoryFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const auth = await requireMember("category:manage");

    const cat = await prisma.category.findFirst({
      where: { id, familyId: auth.familyId },
    });

    if (!cat) {
      throw notFound("Category not found");
    }

    await prisma.category.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
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
