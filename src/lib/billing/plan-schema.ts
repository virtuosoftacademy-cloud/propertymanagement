/**
 * PropertyPro - Plan form validation
 *
 * Kept separate from the form so the same rules can be reused server-side when
 * the plan catalogue moves out of src/lib/billing/plans.ts and into the
 * database. Client-side validation is a convenience, not a guarantee.
 */

import { z } from "zod";
import { MANAGER_PLANS } from "./plans";

/** Lowercase kebab slug — this becomes the persisted planId. */
const PLAN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * @param currentPlanId when editing, the plan's own ID — excluded from the
 * uniqueness check, which would otherwise reject every save that leaves the ID
 * untouched.
 */
export const createPlanFormSchema = (currentPlanId?: string) =>
  z
  .object({
    id: z
      .string()
      .trim()
      .min(1, "Plan ID is required")
      .max(40, "Plan ID cannot exceed 40 characters")
      .regex(
        PLAN_ID_PATTERN,
        "Use lowercase letters, numbers and hyphens, starting with a letter"
      ),
    name: z
      .string()
      .trim()
      .min(1, "Plan name is required")
      .max(60, "Plan name cannot exceed 60 characters"),
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(200, "Description cannot exceed 200 characters"),
    /** Unlimited units — when true the limit input is ignored. */
    unlimitedUnits: z.boolean(),
    unitLimit: z
      .number({ invalid_type_error: "Enter a unit limit" })
      .int("Unit limit must be a whole number")
      .min(1, "Unit limit must be at least 1")
      .max(100_000, "Unit limit is too large")
      .nullable(),
    /** Priced per client — when true the price inputs are ignored. */
    negotiatedPrice: z.boolean(),
    monthlyPrice: z
      .number({ invalid_type_error: "Enter a monthly price" })
      .min(0, "Price cannot be negative")
      .max(1_000_000, "Price is too large")
      .nullable(),
    annualPrice: z
      .number({ invalid_type_error: "Enter an annual price" })
      .min(0, "Price cannot be negative")
      .max(1_000_000, "Price is too large")
      .nullable(),
    /**
     * Optional per-unit charge on top of the flat price, GBP per unit per
     * month. null means flat pricing only.
     */
    pricePerUnit: z
      .number({ invalid_type_error: "Enter a price per unit" })
      .min(0, "Price per unit cannot be negative")
      .max(10_000, "Price per unit is too large")
      .nullable(),
    features: z
      .array(z.string().trim().min(1))
      .min(1, "Add at least one feature")
      .max(20, "That is a lot of features — keep it to 20"),
    popular: z.boolean(),
  })
  .superRefine((data, ctx) => {
    // A plan id is a persisted key; colliding with an existing one would
    // silently reassign every account on that plan. The plan being edited is
    // excluded, or saving without touching the ID would always fail.
    if (
      MANAGER_PLANS.some(
        (plan) => plan.id === data.id && plan.id !== currentPlanId
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "A plan with this ID already exists",
      });
    }

    if (!data.unlimitedUnits && data.unitLimit === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitLimit"],
        message: "Enter a unit limit, or mark the plan unlimited",
      });
    }

    if (!data.negotiatedPrice) {
      if (data.monthlyPrice === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["monthlyPrice"],
          message: "Enter a monthly price, or mark the plan negotiated",
        });
      }
      if (data.annualPrice === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["annualPrice"],
          message: "Enter an annual price, or mark the plan negotiated",
        });
      }
      // A plan that costs nothing however many units you have is almost
      // certainly unfinished, not a deliberate free tier — a free tier has a
      // zero flat price and no per-unit charge, which this still allows.
      if (
        data.monthlyPrice === 0 &&
        data.annualPrice === 0 &&
        (data.pricePerUnit ?? 0) === 0 &&
        data.id !== "free"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["monthlyPrice"],
          message:
            "This plan is free. Set a flat price, a per-unit price, or mark it negotiated.",
        });
      }

      // Paying more per year than twelve months costs is almost always a slip,
      // and it is the sort that quietly loses money. Compared on the flat price
      // only — the per-unit charge is billed monthly either way.
      if (
        data.monthlyPrice !== null &&
        data.annualPrice !== null &&
        data.annualPrice > data.monthlyPrice * 12
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["annualPrice"],
          message: `Annual costs more than 12 months at £${data.monthlyPrice} (£${
            data.monthlyPrice * 12
          }). Check the figure.`,
        });
      }
    }
  });

/** Create-mode schema — every existing ID counts as taken. */
export const planFormSchema = createPlanFormSchema();

export type PlanFormValues = z.infer<ReturnType<typeof createPlanFormSchema>>;

/** Suggest a slug from the display name, so the admin rarely types one. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
