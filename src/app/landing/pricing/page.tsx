import { Fragment } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPlans, type StoredPlan } from "@/lib/billing/plan-store";
import {
  PLAN_COMPARISON,
  type ComparisonValue,
} from "@/lib/billing/plan-comparison";

/**
 * Public pricing page.
 *
 * A server component reading getPlans() directly — a plain DB read, so there
 * is nothing to ship to the client. This used to import MANAGER_PLANS, the
 * hardcoded const: a plan created through the admin UI (plans are roles; see
 * src/lib/billing/plan-store.ts) existed in Stripe and in the database, could
 * be bought via a direct checkout call, but could never be FOUND here — the
 * one place a customer actually shops. getPlans() reads the same live roles
 * the admin catalogue and checkout already price from, with the const as its
 * own fallback if the database is empty or unreachable, so this page can never
 * render nothing.
 *
 * Sign-up links carry ?plan=<id>, which /auth/signup forwards to
 * /api/auth/register — that is what sets the account's role and opens its
 * subscription.
 *
 * Lives at /pricing rather than on a marketing home page, which no longer
 * exists in this project.
 */

// Without this, `next build` prerenders the page ONCE and ships that snapshot
// as static HTML — every visitor would see whatever plans existed at build
// time until the next deploy. A plan an admin creates or edits would be
// invisible here regardless of the fix above, which is the exact bug this
// page exists to not have.
export const dynamic = "force-dynamic";

/** See the comment above the comparison table's render site. */
function shouldShowComparison(plans: StoredPlan[]): boolean {
  const ids = new Set(plans.map((p) => p.id));
  return ids.has("free") && ids.has("pro");
}

function priceLabel(monthlyPrice: number | null) {
  if (monthlyPrice === null) return "POA";
  if (monthlyPrice === 0) return "£0.00";
  return `£${monthlyPrice.toFixed(2)}`;
}

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  }

  if (value === false) {
    return (
      <>
        <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }

  return <span className="text-sm">{value}</span>;
}

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-accent/50 py-12 px-4 sm:px-6 lg:px-8 md:py-28">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Simple pricing for a powerful property management tool
          </h1>
          <p className="text-sm text-muted-foreground">
            All prices include VAT. Subscriptions can be cancelled online at any
            time.
          </p>
        </div>

        {/* Plan cards */}
        <div
          className={`grid gap-6 sm:grid-cols-2 ${
            plans.length >= 3 ? "lg:grid-cols-3" : ""
          } ${plans.length === 1 ? "sm:grid-cols-1 sm:max-w-sm sm:mx-auto" : ""}`}
        >
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background ${
                plan.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  {plan.popular && <Badge>Most popular</Badge>}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">
                    {priceLabel(plan.monthlyPrice)}
                  </span>
                  {plan.monthlyPrice !== null && (
                    <span className="text-sm text-muted-foreground">
                      / month
                    </span>
                  )}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button asChild className="w-full" size="lg">
                  <Link href={`/auth/signup?plan=${plan.id}`}>
                    {plan.monthlyPrice === 0 ? "Get access" : "Get started"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/*
          Comparison table — Free vs Pro only, and deliberately so.
          PLAN_COMPARISON is hand-written marketing copy: each row carries a
          curated hint ("Charged monthly on top of the flat price…") that only
          makes sense written by a person who knows what the plan is FOR. A
          plan an admin creates from a role — see the cards above, which DO
          show every live plan — has no such copy, and fabricating a hint for
          "Agent — £39/mo" would be inventing a claim about a product nobody
          wrote. So this table only renders while both plans it was written
          for still exist; if either is retired, it hides rather than show a
          comparison for a plan that is not being sold.
        */}
        {shouldShowComparison(plans) && (
        <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
          <CardHeader>
            <CardTitle>Compare features</CardTitle>
            <CardDescription>
              Every feature in each plan, side by side.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Wide content scrolls inside its own container so the page body
                never scrolls sideways on a phone. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-125 text-sm">
                <thead>
                  {/* sticky so the plan names stay visible while scrolling a
                      table this long. */}
                  <tr className="sticky top-0 bg-card/95 backdrop-blur-sm">
                    <th className="py-3 pr-4 text-left font-medium">Feature</th>
                    <th className="w-32 py-3 text-center font-semibold">
                      Free
                    </th>
                    <th className="w-48 py-3 text-center font-semibold">Pro</th>
                  </tr>
                </thead>

                <tbody>
                  {PLAN_COMPARISON.map((group) => (
                    // Keyed on the Fragment: the shorthand <> cannot take a
                    // key, so mapping to one would warn on every render.
                    <Fragment key={group.title}>
                      <tr>
                        <th
                          colSpan={3}
                          className="pt-6 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {group.title}
                        </th>
                      </tr>

                      {group.rows.map((row) => (
                        <tr
                          key={`${group.title}-${row.label}`}
                          className="border-b last:border-0"
                        >
                          <td className="py-3 pr-4">
                            <span title={row.hint}>{row.label}</span>
                            {row.hint && (
                              <span className="block text-xs text-muted-foreground">
                                {row.hint}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-center">
                            <Cell value={row.free} />
                          </td>
                          <td className="py-3 text-center">
                            <Cell value={row.pro} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
