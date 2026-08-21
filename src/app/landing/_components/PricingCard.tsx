"use client";

import { useState } from "react";
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Paid plans go through Stripe Checkout; the price is chosen server-side. */
  const startCheckout = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: id, cycle: "monthly" }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success || !result?.data?.url) {
        setError(result?.error || "Could not start checkout. Please try again.");
        setBusy(false);
        return;
      }

      window.location.href = result.data.url;
    } catch {
      setError("Could not reach the payment service. Please try again.");
      setBusy(false);
    }
  };

  // Free needs no payment and Custom is negotiated, so neither goes to Stripe.
  const isPaid = monthlyPrice !== null && monthlyPrice > 0 && !custom;

  const ctaLabel = custom
    ? "Talk to us"
    : monthlyPrice === 0
      ? "Start for free"
      : busy
        ? "Redirecting…"
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

        <h4 className="text-xl font-bold text-foreground">{name}</h4>

        {/* Price — negotiated plans show what they are instead of a figure */}
        {monthlyPrice !== null ? (
          <div className="flex items-end gap-1 leading-none">
            <span className="text-2xl font-bold text-foreground">£</span>
            <span className="text-4xl md:text-5xl font-bold text-foreground">
              {monthlyPrice.toLocaleString("en-GB")}
            </span>
            <span className="text-sm text-foreground/50 mb-1 font-serif">/mo</span>
          </div>
        ) : (
          <p className="font-serif text-sm md:text-lg text-foreground/60 leading-relaxed">
            {description}
          </p>
        )}

        <ul className="flex flex-col gap-3 flex-1">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <p className="font-serif text-sm md:text-lg text-foreground/65 leading-relaxed">
                {f}
              </p>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {isPaid ? (
          <button
            type="button"
            onClick={startCheckout}
            disabled={busy}
            className={ctaClass}
            style={ctaStyle}
          >
            {ctaLabel}
          </button>
        ) : (
          <Link
            href={custom ? "#contact" : `/auth/signup?plan=${id}`}
            className={ctaClass}
            style={ctaStyle}
          >
            {ctaLabel}
          </Link>
        )}

      </div>
    </div>
  );
}
