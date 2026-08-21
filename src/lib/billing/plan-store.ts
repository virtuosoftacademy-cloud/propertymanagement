/**
 * PropertyPro - Plan catalogue, read from roles
 *
 * SERVER ONLY. A subscription plan IS a role (see src/models/Role.ts): the plan
 * id is the role name, registration assigns it, and the Stripe webhook promotes
 * a paying user to it. Storing the pricing on the role means the permissions a
 * plan grants and the price it charges are one record and cannot drift.
 *
 * MANAGER_PLANS in ./plans stays as the SEED and the FALLBACK:
 *
 *   - client components import it directly, so rendering a price needs no fetch
 *   - if the database is unreachable, callers still get a sane catalogue rather
 *     than an empty one, which would read as "no plans exist" and silently
 *     disable checkout and the unit ceiling
 */

import { Role } from "@/models";
import { MANAGER_PLANS, type ManagerPlan } from "./plans";

/** A plan as stored on a role, plus the Stripe ids the const cannot carry. */
export interface StoredPlan extends ManagerPlan {
  stripeProductId?: string | null;
  stripePriceIdMonthly?: string | null;
  stripePriceIdAnnual?: string | null;
}

function fromRole(r: any): StoredPlan {
  return {
    id: r.name,
    name: r.label || r.name,
    description: r.description || "",
    unitLimit: r.unitLimit ?? null,
    monthlyPrice: r.monthlyPrice ?? null,
    annualPrice: r.annualPrice ?? null,
    pricePerUnit: r.pricePerUnit ?? null,
    features: Array.isArray(r.features) ? r.features : [],
    popular: Boolean(r.popular),
    custom: Boolean(r.custom),
    stripeProductId: r.stripeProductId ?? null,
    stripePriceIdMonthly: r.stripePriceIdMonthly ?? null,
    stripePriceIdAnnual: r.stripePriceIdAnnual ?? null,
  };
}

/**
 * Every active plan, cheapest first so the pricing grid reads left to right.
 *
 * Falls back to the const when no plan roles exist yet (a database that has not
 * been seeded) or when the query fails. Never returns an empty array: an empty
 * catalogue makes `resolvePlan` fail for every id, which would disable checkout
 * and — because an unresolvable plan has no unitLimit — remove the unit ceiling.
 */
export async function getPlans(): Promise<StoredPlan[]> {
  try {
    const roles: any[] = await Role.find({ isPlan: true, isActive: true })
      .sort({ monthlyPrice: 1 })
      .lean();

    if (roles.length === 0) return MANAGER_PLANS as StoredPlan[];
    return roles.map(fromRole);
  } catch (error) {
    console.error("[billing] plan lookup failed, using the built-in catalogue:", error);
    return MANAGER_PLANS as StoredPlan[];
  }
}

/** One plan by id (== role name), or undefined. */
export async function getPlan(planId: string): Promise<StoredPlan | undefined> {
  if (!planId) return undefined;
  const plans = await getPlans();
  return plans.find((p) => p.id === planId);
}

/**
 * The Stripe Price id for a plan and cycle.
 *
 * Throws when the plan is paid but has no Price. A silent fallback would send
 * the customer to Checkout for the wrong amount, which is worse than a 500 —
 * this is the same rule the old env-var mapping enforced.
 */
export function priceIdFor(
  plan: StoredPlan,
  cycle: "monthly" | "annual"
): string | null {
  // Free and negotiated plans are provisioned without Checkout.
  if (plan.custom) return null;
  const amount = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
  if (amount === null || amount === 0) return null;

  const id =
    cycle === "annual" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;

  if (!id) {
    throw new Error(
      `Plan "${plan.id}" is sold at £${amount}/${cycle} but has no Stripe Price. ` +
        `Re-save the plan so its Price is created, or add the id by hand.`
    );
  }

  return id;
}

/** Reverse lookup for the webhook, which only knows the Price that was paid. */
export async function planForPriceId(
  priceId: string
): Promise<{ plan: StoredPlan; cycle: "monthly" | "annual" } | null> {
  const plans = await getPlans();
  for (const plan of plans) {
    if (plan.stripePriceIdMonthly === priceId) return { plan, cycle: "monthly" };
    if (plan.stripePriceIdAnnual === priceId) return { plan, cycle: "annual" };
  }
  return null;
}
