/**
 * PropertyPro - Manager account plan catalogue
 *
 * What a client pays the ADMIN to be given a Manager account. A plain const
 * rather than a DB collection: plans change on deploy, not at runtime, and
 * keeping it importable from client components avoids a fetch just to render
 * a price.
 *
 * NOTE: prices and unit limits are placeholders pending sign-off. Payment is
 * cash-only for now (see ManagerPaymentMethod), so there is no payment
 * provider, no price ids and no checkout — the admin records what was received.
 */

export interface ManagerPlan {
  /** Stable key persisted on a manager account. Renaming this is a migration. */
  id: string;
  name: string;
  description: string;
  /** How many units this manager may operate. null = unlimited / bespoke. */
  unitLimit: number | null;
  /** GBP, major units. null = negotiated per client. */
  monthlyPrice: number | null;
  annualPrice: number | null;
  /**
   * Optional per-unit charge on top of the flat price, in GBP per unit per
   * month. null/undefined means the flat price is the whole story.
   */
  pricePerUnit?: number | null;
  features: string[];
  popular?: boolean;
  /** Priced per client rather than off the shelf. */
  custom?: boolean;
}

export const MANAGER_PLANS: ManagerPlan[] = [
  {
    id: "free",
    name: "Free",
    description:
      "Everything you need to successfully self-manage your first rental unit.",
    unitLimit: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    pricePerUnit: null,
    features: [
      "1 unit",
      "MTD ready",
      "Rent and expense tracking",
      "Inventory builder",
      "Task and certificate reminders",
      "Tax return report",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For professional landlords and property managers.",
    // Unlimited units: the flat price covers the first five, and pricePerUnit
    // applies beyond that.
    unitLimit: null,
    monthlyPrice: 15,
    // Not offered annually yet — monthly only, cancellable online.
    annualPrice: null,
    pricePerUnit: 1.5,
    popular: true,
    features: [
      "Units 1-5 included, then £1.50/unit/month",
      "MTD ready",
      "HMO management",
      "Integrated free e-signatures",
      "Customisable templates",
      "Unlimited storage",
      "Open Banking integration",
      "Tenant portal",
    ],
  },
];

export const DEFAULT_PLAN_ID = "starter";

export function resolvePlan(planId: string): ManagerPlan | undefined {
  return MANAGER_PLANS.find((plan) => plan.id === planId);
}

/** Normalise a cycle amount to a monthly figure so revenue can be summed. */
export function monthlyEquivalent(
  amount: number,
  cycle: "monthly" | "annual"
): number {
  return cycle === "annual" ? amount / 12 : amount;
}

/**
 * What a portfolio of `units` costs per month on this plan: the flat price plus
 * any per-unit charge. Returns null for negotiated plans, where there is no
 * list price to compute from.
 */
export function monthlyTotalFor(
  plan: ManagerPlan | undefined,
  units: number
): number | null {
  if (!plan || plan.monthlyPrice === null) return null;
  const perUnit = plan.pricePerUnit ?? 0;
  return plan.monthlyPrice + perUnit * Math.max(0, units);
}

