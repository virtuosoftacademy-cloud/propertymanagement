/**
 * PropertyPro - Subscription checkout
 *
 * Public by design: this is the "Get started" path, so the caller is a visitor
 * with no session. (It was reached from the landing page, which has since been
 * removed — the endpoint still expects an unauthenticated caller, so whatever
 * replaces that entry point can call it the same way.)
 * Stripe collects the email and the card
 * on its own hosted page — nothing sensitive is posted here, and the amount is
 * never taken from the request. The client sends a plan id; the price comes
 * from our own env-mapped Stripe Price, so a tampered body cannot buy Growth at
 * the Starter price.
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-utils";
import { resolvePlan } from "@/lib/billing/plans";
import { isCheckoutablePlan, stripePriceIdFor } from "@/lib/billing/stripe-prices";

const checkoutSchema = z.object({
  planId: z.string().trim().min(1),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return createErrorResponse(
        "Online payment is not configured yet. Please get in touch and we'll set you up.",
        503
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse("Choose a plan to continue", 400);
    }

    const { planId, cycle } = parsed.data;
    const plan = resolvePlan(planId);

    if (!plan) return createErrorResponse("Unknown plan", 400);

    // Free is provisioned without payment and Custom is negotiated; neither has
    // a Price, so sending them to Checkout would 500 on an empty line item.
    if (!isCheckoutablePlan(planId)) {
      return createErrorResponse(
        plan.custom
          ? "This plan is priced per client — please contact us."
          : "This plan does not require payment.",
        400
      );
    }

    const priceId = stripePriceIdFor(planId, cycle);
    if (!priceId) return createErrorResponse("Unknown plan", 400);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Stripe collects the email; we never handle the customer's credentials.
      // No customer_creation here: Stripe rejects it outside `payment` mode,
      // and in subscription mode a Customer is always created anyway.
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      // The webhook is the only thing that provisions, and it reads these back
      // rather than trusting the client that started the session.
      subscription_data: { metadata: { planId, cycle } },
      metadata: { planId, cycle },
      success_url: `${appUrl()}/billing/welcome?session_id={CHECKOUT_SESSION_ID}`,
      // The landing page (and its #pricing anchor) has been removed; send a
      // cancelled checkout back to the app root instead of a dead URL.
      cancel_url: `${appUrl()}/`,
    });

    if (!session.url) {
      return createErrorResponse("Could not start checkout", 502);
    }

    return createSuccessResponse({ url: session.url });
  } catch (error) {
    // Includes the deliberate throw from stripePriceIdFor when a Price env var
    // is missing — better a 500 than a Checkout session for the wrong amount.
    console.error("Checkout error:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Could not start checkout",
      500
    );
  }
}
