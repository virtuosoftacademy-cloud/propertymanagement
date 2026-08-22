
import { MANAGER_PLANS } from "@/lib/billing/plans";
import PricingCard from "./PricingCard";

export default function LandingPricing() {
  const columns =
    MANAGER_PLANS.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : MANAGER_PLANS.length === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <section id="pricing" className="bg-foreground/5 dark:bg-foreground py-20 px-6 sm:px-12">
      <div className="mx-auto max-w-[212.5rem]">

        {/* ── Heading ── */}
        <div className="flex items-center gap-4 mb-4 text-foreground">
          <div className="flex-1" />
          <h4 className="text-3xl md:text-4xl font-bold text-center dark:text-accent whitespace-nowrap">
            Our <span className="text-primary">Pricing</span>
          </h4>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <p className="font-serif text-sm md:text-lg text-center text-foreground/60 leading-relaxed mb-12">
          Choose the plan that fits your portfolio.
        </p>

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
