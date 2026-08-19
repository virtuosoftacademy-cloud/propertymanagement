/**
 * PropertyPro - Stripe Price lookup for manager plans
 *
 * SERVER ONLY. Never import this from a client component: it reads non-public
 * env, which would resolve to undefined in the browser and silently break the
 * price lookup.
 *
 * Price ids live in env rather than in plans.ts for two reasons: plans.ts is
 * imported by client components, and the ids differ per Stripe mode, so test
 * and live deploys must not share a literal. (The client importer was the
 * landing page's pricing section, now removed — the split still holds for any
 * client-side pricing UI, and the per-mode reason stands on its own.)
 *
 * Create the Products/Prices in the Stripe dashboard, then set:
 *
 *   STRIPE_PRICE_PRO_MONTHLY=price_...
 *   STRIPE_PRICE_PRO_ANNUAL=price_...
 *
 * `free` has nothing to charge and `custom` is negotiated, so neither has a
 * price id — both are provisioned without going through Checkout.
 */

import { resolvePlan } from "./plans";

export type BillingCycle = "monthly" | "annual";

const PRICE_ENV: Record<string, Record<BillingCycle, string>> = {
  // Annual is not sold today (MANAGER_PLANS.pro.annualPrice is null), but the
  // key is declared so a caller passing cycle: "annual" gets the intended
  // "missing env var" throw from stripePriceIdFor rather than a silent
  // fallback to the monthly price.
  pro: {
    monthly: "STRIPE_PRICE_PRO_MONTHLY",
    annual: "STRIPE_PRICE_PRO_ANNUAL",
  },
};

/** Plans that are provisioned directly instead of through Stripe Checkout. */
export function isCheckoutablePlan(planId: string): boolean {
  return planId in PRICE_ENV;
}

/**
 * The Stripe Price id for a plan and cycle, or null when the plan is not sold
 * through Checkout. Throws when the plan IS checkoutable but the env var is
 * missing — a silent fallback would send the customer to a Checkout session for
 * the wrong amount, which is worse than a 500.
 */
export function stripePriceIdFor(
  planId: string,
  cycle: BillingCycle
): string | null {
  const envKeys = PRICE_ENV[planId];
  if (!envKeys) return null;

  const key = envKeys[cycle];
  const priceId = process.env[key];

  if (!priceId) {
    throw new Error(
      `Missing ${key}. Create the ${planId} ${cycle} Price in Stripe and set ${key} before selling this plan.`
    );
  }

  return priceId;
}

/** Reverse lookup for the webhook, which only knows the Price that was paid. */
export function planForStripePrice(
  priceId: string
): { planId: string; cycle: BillingCycle } | null {
  for (const [planId, cycles] of Object.entries(PRICE_ENV)) {
    for (const cycle of ["monthly", "annual"] as BillingCycle[]) {
      if (process.env[cycles[cycle]] === priceId) return { planId, cycle };
    }
  }
  return null;
}

/**
 * List price for a plan/cycle in GBP major units, used to stamp the amount on
 * an account. Stripe remains the source of truth for what was actually charged;
 * this is only the fallback when an amount is not otherwise known.
 */
export function listPriceFor(
  planId: string,
  cycle: BillingCycle
): number | null {
  const plan = resolvePlan(planId);
  if (!plan) return null;
  return cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
}
