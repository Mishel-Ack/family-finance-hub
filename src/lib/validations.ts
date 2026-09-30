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
  .refine((v) => Number((v * 100).toFixed(2)) % 1 === 0, {
    message: "Amount cannot have more than 2 decimal places",
  });

export const budgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  totalLimit: amountSchema,
});

export const categoryLimitSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  limitAmount: amountSchema,
});

export const expenseSchema = z.object({
  amount: amountSchema,
  categoryId: z.string().min(1, "Category is required"),
  memberId: z.string().optional().nullable(),
  date: z.string().min(1, "Date is required"),
  description: z.string().trim().max(200).optional().default(""),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});
