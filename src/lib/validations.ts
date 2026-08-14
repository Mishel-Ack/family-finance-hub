import { z } from "zod";
import { CATEGORIES } from "./constants";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    email: z.string().trim().email("Enter a valid email").max(255),
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Password is required").max(72),
});

export const amountSchema = z
  .number({ invalid_type_error: "Enter a valid amount" })
  .finite()
  .nonnegative("Amount cannot be negative");

export const budgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  totalLimit: amountSchema.refine((v) => v > 0, "Total budget must be greater than 0"),
});

export const categoryLimitSchema = z.object({
  category: z.enum(CATEGORIES),
  limitAmount: amountSchema.refine((v) => v > 0, "Limit must be greater than 0"),
});

export const expenseSchema = z.object({
  amount: amountSchema.refine((v) => v > 0, "Amount must be greater than 0"),
  category: z.enum(CATEGORIES),
  date: z.string().min(1, "Date is required"),
  description: z.string().trim().max(200).optional().default(""),
  familyMember: z.string().trim().max(80).optional().default(""),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});