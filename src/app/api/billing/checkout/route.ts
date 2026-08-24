/**
 * PropertyPro - Subscription checkout
 *
 * Unauthenticated, but NOT unidentified: the caller has just registered and is
 * not signed in yet, so there is no session to read — but the account must
 * already exist, and this refuses to create a Stripe session otherwise. Taking
 * money before an account exists means a failed provisioning leaves a customer
 * who has paid for nothing.
 *
 * Stripe collects the card on its own hosted page — nothing sensitive is posted
 * here, and the amount is never taken from the request. The client sends a plan
 * id; the price comes from our own Stripe Price, so a tampered body cannot buy
 * Pro at the Free price.
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Stripe from "stripe";
import { z } from "zod";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-utils";

import { getPlan, priceIdFor } from "@/lib/billing/plan-store";

const checkoutSchema = z.object({
  planId: z.string().trim().min(1),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  /**
   * Who started this. Optional because the endpoint is public, but the sign-up
   * page always sends it — and without it the webhook can only identify the
   * buyer by the email they typed into Stripe. Someone who registers as one
   * address and pays with another then gets a SECOND account instead of having
   * their pending one claimed.
   */
  email: z.string().trim().email().optional(),
  userId: z.string().trim().optional(),
});

function appUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  // Strip trailing slashes. Every caller appends "/path", so a value ending in
  // "/" — which is what you get pasting a domain out of a browser or Vercel —
  // produced "https://host//billing/welcome" in the Stripe success_url and in
  // the emailed password-reset link.
  return base.replace(/\/+$/, "");
}

/**
 * The account this checkout belongs to, or null.
 *
 * Raw driver on purpose: the User model hides soft-deleted rows, and a deleted
 * account must be reported as deleted rather than as "no account" — otherwise
 * the caller is told to sign up, which then fails on the unique email index.
 */
async function findBuyer(
  userId?: string,
  email?: string
): Promise<{ deletedAt?: Date | null } | null> {
  const { User } = await import("@/models");
  const or: any[] = [];

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    or.push({ _id: new mongoose.Types.ObjectId(userId) });
  }
  if (email) or.push({ email: email.toLowerCase() });
  if (or.length === 0) return null;

  return (await User.collection.findOne({ $or: or })) as any;
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

    const { planId, cycle, email, userId } = parsed.data;

    // No account, no payment.
    //
    // This endpoint used to start a Stripe session for anyone — logged out,
    // no userId, no email — because the landing page's "Get started" button
    // called it directly and left account creation to the webhook. That meant
    // money could be taken before an account existed, and if provisioning then
    // failed the customer had paid for nothing. Sign-up now happens first and
    // passes the id it just created, so refusing here is what makes "an
    // account exists before we charge" an actual guarantee rather than a
    // convention the UI happens to follow.
    const buyer = await findBuyer(userId, email);
    if (!buyer) {
      return createErrorResponse(
        "Create your account before checking out, so we can attach the subscription to it.",
        400
      );
    }
    if (buyer.deletedAt) {
      return createErrorResponse(
        "This account has been deleted. Please contact support before subscribing.",
        409
      );
    }

    const plan = await getPlan(planId);

    if (!plan) return createErrorResponse("Unknown plan", 400);

    // Free is provisioned without payment and Custom is negotiated; neither has
    // a Price, so sending them to Checkout would 500 on an empty line item.
    // priceIdFor returns null for those, and THROWS for a paid plan with no
    // Price — a silent fallback would charge the wrong amount.
    const priceId = priceIdFor(plan, cycle);
    if (!priceId) {
      return createErrorResponse(
        plan.custom
          ? "This plan is priced per client — please contact us."
          : "This plan does not require payment.",
        400
      );
    }

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
      // Prefill so the buyer is nudged towards the address they registered
      // with; the metadata below is what actually identifies them, because a
      // buyer can always overwrite this field on Stripe's page.
      ...(email ? { customer_email: email } : {}),
      subscription_data: {
        metadata: { planId, cycle, ...(userId ? { userId } : {}), ...(email ? { signupEmail: email } : {}) },
      },
      metadata: { planId, cycle, ...(userId ? { userId } : {}), ...(email ? { signupEmail: email } : {}) },
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
