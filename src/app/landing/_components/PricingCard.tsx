"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ManagerPlan } from "@/lib/billing/plans";

interface PricingCardProps {
  plan: ManagerPlan;
}

export default function PricingCard({ plan }: PricingCardProps) {
  const { id, name, description, monthlyPrice, features, popular, custom } =
    plan;

  /**
   * Every paid plan now goes through sign-up first.
   *
   * This card used to POST straight to /api/billing/checkout and hand the
   * visitor to Stripe with no account, no email and no userId — leaving the
   * webhook to invent an account afterwards from whatever address they typed
   * on Stripe's page. A typo there created the account under the wrong email,
   * and any failure during provisioning meant they had paid for nothing.
   * /auth/signup?plan=<id> creates the account, then starts checkout with the
   * id it just created; the checkout endpoint now refuses callers without one.
   */

  const ctaLabel = custom
    ? "Talk to us"
    : monthlyPrice === 0
      ? "Start for free"
      : "Get started";

  const ctaClass = cn(
    "w-full py-4 text-sm font-semibold text-center transition-opacity hover:opacity-85 disabled:opacity-60",
    popular ? "text-white" : "border bg-transparent"
  );

  const ctaStyle = popular
    ? { background: "var(--sidebar-primary)" }
    : {
        borderColor: "var(--sidebar-primary)",
        color: "var(--sidebar-primary)",
      };

  return (
    <div className={cn("bg-white flex flex-col", popular && "ring-0")}>

      {/* Popular badge */}
      {popular && (
        <div className="px-6 py-3 text-sm md:text-xl bg-primary font-semibold text-white">
          Popular
        </div>
      )}

      <div className="flex flex-col flex-1 p-8 gap-6">

        <h4 className="text-xl font-bold text-foreground dark:text-accent">{name}</h4>

        {/* Price — negotiated plans show what they are instead of a figure */}
        {monthlyPrice !== null ? (
          <div className="flex items-end gap-1 leading-none">
            <span className="text-2xl font-bold text-foreground dark:text-accent">£</span>
            <span className="text-4xl md:text-5xl font-bold text-foreground dark:text-accent">
              {monthlyPrice.toLocaleString("en-GB")}
            </span>
            <span className="text-sm text-foreground/50 mb-1 font-serif">/mo</span>
          </div>
        ) : (
          <p className="font-serif text-sm md:text-lg text-foreground/60 dark:text-accent leading-relaxed">
            {description}
          </p>
        )}

        <ul className="flex flex-col gap-3 flex-1">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <p className="font-serif text-sm md:text-lg text-foreground/65 dark:text-accent/65 leading-relaxed">
                {f}
              </p>
            </li>
          ))}
        </ul>

        <Link
          href={custom ? "#contact" : `/auth/signup?plan=${id}`}
          className={ctaClass}
          style={ctaStyle}
        >
          {ctaLabel}
        </Link>

      </div>
    </div>
  );
}
