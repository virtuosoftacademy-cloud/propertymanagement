/**
 * PropertyPro - Manager account form validation
 *
 * Kept separate from the dialog so the same rules can be reused server-side
 * when POST /api/manager-accounts is built. Client-side validation is a
 * convenience, not a guarantee.
 */

import { z } from "zod";
import { isValidPhoneNumber } from "@/lib/utils";
import { MANAGER_PLANS, resolvePlan } from "./plans";

export const managerAccountFormSchema = z
  .object({
    /**
     * The selected user. Held alongside clientName so the account can carry a
     * real reference (ManagerAccount.managerUserId) rather than a name string
     * nothing can join on.
     */
    clientUserId: z.string().trim().min(1, "Select a client"),
    clientName: z
      .string()
      .trim()
      .min(1, "Client name is required")
      .max(200, "Client name cannot exceed 200 characters"),
    /** Optional: a sole trader is billed under their own name. */
    companyName: z
      .string()
      .trim()
      .max(200, "Company name cannot exceed 200 characters")
      .optional(),
    contactEmail: z
      .string()
      .trim()
      .min(1, "Contact email is required")
      .email("Enter a valid email address"),
    contactPhone: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => !value || isValidPhoneNumber(value),
        "Enter a valid UK phone number, e.g. 07700 900000 or 01632 960000"
      ),
    managerName: z
      .string()
      .trim()
      .max(120, "Manager name cannot exceed 120 characters")
      .optional(),
    planId: z
      .string()
      .refine(
        (value) => MANAGER_PLANS.some((plan) => plan.id === value),
        "Choose a plan"
      ),
    billingCycle: z.enum(["monthly", "annual"]),
    amount: z
      .number({ invalid_type_error: "Enter an amount" })
      .min(0, "Amount cannot be negative")
      .max(1_000_000, "Amount is too large"),
    startedAt: z.string().min(1, "Start date is required"),
    renewsAt: z.string().optional(),
    status: z.enum(["pending", "active"]),
    notes: z.string().trim().max(2000, "Notes are too long").optional(),
  })
  .refine(
    (data) => {
      // A renewal before the start date is a data-entry slip, not a valid deal.
      if (!data.renewsAt) return true;
      const start = new Date(data.startedAt);
      const renew = new Date(data.renewsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(renew.getTime())) {
        return true; // malformed dates are the field's own problem
      }
      return renew > start;
    },
    { message: "Renewal date must be after the start date", path: ["renewsAt"] }
  )
  .refine(
    (data) => {
      // Off-the-shelf plans must be sold at their catalogue price; only Custom
      // is negotiated. Catching this here stops silent revenue drift.
      const plan = resolvePlan(data.planId);
      if (!plan || plan.custom) return true;
      const expected =
        data.billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
      return expected === null || data.amount === expected;
    },
    {
      message:
        "This differs from the plan price. Use the Custom plan for a negotiated amount.",
      path: ["amount"],
    }
  );

export type ManagerAccountFormValues = z.infer<typeof managerAccountFormSchema>;

/** Catalogue price for a plan/cycle, or null when negotiated. */
export function priceFor(
  planId: string,
  cycle: "monthly" | "annual"
): number | null {
  const plan = resolvePlan(planId);
  if (!plan) return null;
  return cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
}

/**
 * Start date plus one billing cycle, as a yyyy-mm-dd string for a date input.
 *
 * The day is clamped to the last day of the target month rather than allowed to
 * overflow: 31 Jan + 1 month is 28 Feb, not 3 March, and 29 Feb + 1 year is
 * 28 Feb, not 1 March. Overflow would push a renewal into the wrong month
 * entirely, which is the sort of default nobody notices until an invoice is
 * dated wrongly.
 *
 * Works in UTC throughout — the input is a bare yyyy-mm-dd, which Date parses
 * as UTC midnight, so mixing in local-time getters could shift the result by a
 * day either side of the boundary.
 */
export function nextRenewalDate(
  startedAt: string,
  cycle: "monthly" | "annual"
): string {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return "";

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();

  const targetYear =
    cycle === "annual" ? year + 1 : month === 11 ? year + 1 : year;
  const targetMonth = cycle === "annual" ? month : (month + 1) % 12;

  // Day 0 of the month after the target is the target's last day.
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, daysInTargetMonth))
  )
    .toISOString()
    .slice(0, 10);
}
