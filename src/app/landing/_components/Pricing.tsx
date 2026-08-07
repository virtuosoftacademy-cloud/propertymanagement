// components/landing/pricing/LandingPricing.tsx

import { PricingPlans } from "../_constant";
import PricingCard from "./PricingCard";

export default function LandingPricing() {
    return (
        <section className="bg-muted py-20 px-6 sm:px-12">
            <div className="mx-auto max-w-[212.5rem]">

                {/* ── Heading ── */}
                <div className="flex items-center gap-4 mb-4 text-foreground">
                    <div className="flex-1" />
                    <h4 className="text-3xl md:text-4xl font-bold text-center whitespace-nowrap">
                        Our{" "}
                        <span className="text-primary">Pricing</span>
                    </h4>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                <p className="font-serif text-sm md:text-lg text-center text-foreground/60 leading-relaxed mb-12">
                    Choose the plan that fits your portfolio.
                </p>

                {/* ── 4-col pricing grid ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
                    {PricingPlans.map((plan) => (
                        <PricingCard key={plan.id} plan={plan} />
                    ))}
                </div>

            </div>
        </section>
    );
}