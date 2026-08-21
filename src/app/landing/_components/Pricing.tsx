// components/landing/pricing/LandingPricing.tsx

import { MANAGER_PLANS } from "@/lib/billing/plans";
import PricingCard from "./PricingCard";

/**
 * Ported from the tenurelandingpage project, with one difference: the plans
 * come from THIS app's catalogue (src/lib/billing/plans.ts), not the four-tier
 * one that landing page ships. Those tiers were retired here, and their Stripe
 * Prices do not exist — rendering them would put a "Get started" button on a
 * plan whose checkout throws.
 */
export default function LandingPricing() {
  // The column count follows the catalogue. Hardcoding four left two plans
  // squeezed into half a row, and would silently misalign again if a tier were
  // added or retired.
  const columns =
    MANAGER_PLANS.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : MANAGER_PLANS.length === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <section id="pricing" className="bg-muted py-20 px-6 sm:px-12">
      <div className="mx-auto max-w-[212.5rem]">

        {/* ── Heading ── */}
        <div className="flex items-center gap-4 mb-4 text-foreground">
          <div className="flex-1" />
          <h4 className="text-3xl md:text-4xl font-bold text-center whitespace-nowrap">
            Our <span className="text-primary">Pricing</span>
          </h4>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <p className="font-serif text-sm md:text-lg text-center text-foreground/60 leading-relaxed mb-12">
          Choose the plan that fits your portfolio.
        </p>

        {/* ── Pricing grid ── */}
        <div
          className={`grid grid-cols-1 ${columns} gap-5 items-start mx-auto ${
            MANAGER_PLANS.length < 4 ? "max-w-4xl" : ""
          }`}
        >
          {MANAGER_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>

      </div>
    </section>
  );
}
