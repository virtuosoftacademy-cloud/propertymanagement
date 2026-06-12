// components/landing/pricing/PricingCard.tsx

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingPlan } from "@/app/_constant";

interface PricingCardProps {
  plan: PricingPlan;
}

export default function PricingCard({ plan }: PricingCardProps) {
  const { name, price, period, features, cta, popular, custom, note } = plan;

  return (
    <div className={cn("bg-white flex flex-col", popular && "ring-0")}>

      {/* Popular badge */}
      {popular && (
        <div
          className="px-6 py-3 text-sm md:text-xl bg-primary font-semibold text-white"
        >
          Popular
        </div>
      )}

      <div className="flex flex-col flex-1 p-8 gap-6">

        {/* Plan name */}
        <h4 className="text-xl font-bold text-foreground">
          {name}
        </h4>

        {/* Price */}
        {price !== null ? (
          <div className="flex items-end gap-1 leading-none">
            <span className="text-2xl font-bold text-foreground">$</span>
            <span className="text-4xl md:text-5xl font-bold text-foreground">{price}</span>
            <span className="text-sm text-foreground/50 mb-1 font-serif">{period}</span>
          </div>
        ) : (
          /* Custom plan — show description instead of price */
          <p className="font-serif text-sm md:text-lg text-foreground/60 leading-relaxed">
            Pricing plan will be as per client or company requirements
          </p>
        )}

        {/* Features */}
        <ul className="flex flex-col gap-3 flex-1">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <CheckCircle2
                className="h-4 w-4 shrink-0 mt-0.5 text-primary"
              />
              <p className="font-serif text-sm md:text-lg text-foreground/65 leading-relaxed">{f}</p>
            </li>
          ))}
        </ul>

        {/* Note */}
        {note && (
          <p className="font-serif text-xs text-foreground/40">{note}</p>
        )}

        {/* CTA */}
        <button
          className={cn(
            "w-full py-4 text-sm font-semibold transition-opacity hover:opacity-85",
            popular
              ? "text-white"
              : "border text-foreground/70 bg-transparent"
          )}
          style={
            popular
              ? { background: "var(--sidebar-primary)" }
              : { borderColor: "var(--sidebar-primary)", color: "var(--sidebar-primary)" }
          }
        >
          {cta}
        </button>

      </div>
    </div>
  );
}