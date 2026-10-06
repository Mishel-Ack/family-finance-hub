import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    email: z
      .string()
      .trim()
      .transform((val) => val.toLowerCase())
      .pipe(z.string().email("Enter a valid email"))
      .pipe(z.string().max(255)),
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .transform((val) => val.toLowerCase())
    .pipe(z.string().email("Enter a valid email"))
    .pipe(z.string().max(255)),
  password: z.string().min(1, "Password is required").max(72),
});

export const amountSchema = z
  .number({ invalid_type_error: "Enter a valid amount" })
  .finite()
  .positive("Amount must be greater than 0")
  .max(10_000_000, "Amount cannot exceed ₹1 crore")
  .refine(
    (v) =>
      Number(v.toFixed(2)) === v ||
      Math.abs(Number(v.toFixed(2)) - v) <= Number.EPSILON * Math.max(1, Math.abs(v)) * 2,
    {
      message: "Amount cannot have more than 2 decimal places",
    },
  );

export const idSchema = z.string().uuid("Invalid ID");
export const idsSchema = z.object({ id: idSchema });
export const monthYearSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});
export const yearSchema = z.number().int().min(2000).max(2100);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date");
export const dateRangeSchema = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional() })
  .refine(({ from, to }) => !from || !to || from <= to, "Start date must be on or before end date");

export const budgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  totalLimit: amountSchema,
});

export const categoryLimitSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  limitAmount: amountSchema,
});

export const splitInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("EQUAL"), memberIds: z.array(idSchema).min(1).max(100) }),
  z.object({
    mode: z.literal("EXACT"),
    participants: z
      .array(z.object({ memberId: idSchema, sharePaise: z.number().int().positive() }))
      .min(1)
      .max(100),
  }),
  z.object({
    mode: z.literal("PERCENT"),
    participants: z
      .array(z.object({ memberId: idSchema, basisPoints: z.number().int().positive().max(10000) }))
      .min(1)
      .max(100),
  }),
]);
export const expenseSchema = z.object({
  amount: amountSchema,
  categoryId: z.string().min(1, "Category is required"),
  memberId: z.string().optional().nullable(),
  date: dateSchema,
  description: z.string().trim().max(200).optional().default(""),
  visibility: z.enum(["SHARED", "PRIVATE"]).optional().default("SHARED"),
  split: splitInputSchema.nullable().optional(),
});
export const expenseListQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    visibility: z.enum(["VISIBLE", "SHARED", "PRIVATE"]).optional().default("VISIBLE"),
  })
  .refine(({ from, to }) => !from || !to || from <= to, "Start date must be on or before end date");

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});

export const profileUpdateSchema = profileSchema;
export const profileNameSchema = profileSchema.shape.name;
export const familyRenameSchema = z.string().trim().min(2).max(80);
export const registerServerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.string().email("Enter a valid email"))
    .pipe(z.string().max(255)),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
export const loginServerSchema = loginSchema;
export const inviteRoleSchema = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
export const inviteCreateSchema = z.object({
  role: inviteRoleSchema,
  email: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.string().email().max(255))
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});
export const inviteTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid invite token");
export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
  leaveExistingFamily: z.boolean().optional().default(false),
});
export const registerWithInviteSchema = registerServerSchema.extend({ token: inviteTokenSchema });
export const memberAddSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});
export const memberRoleChangeSchema = z.object({
  id: idSchema,
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});
export const ownDisplayNameSchema = z.string().trim().min(1).max(50);
export const transferOwnershipSchema = z.object({
  targetMemberId: idSchema,
  familyNameConfirmation: z.string().min(1).max(80),
});
export const createFamilySchema = z.string().trim().min(2).max(80);
export const emptyInputSchema = z.undefined();
export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().max(40).optional(),
});
export const categoryUpdateSchema = z.object({
  id: idSchema,
  input: categoryCreateSchema.partial(),
});
export const expenseUpdateSchema = z.object({ id: idSchema, input: expenseSchema });
export const budgetCategoryInputSchema = z.object({
  budgetId: idSchema,
  categoryId: idSchema,
  limitAmount: amountSchema,
});
