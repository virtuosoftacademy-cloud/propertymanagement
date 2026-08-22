/**
 * PropertyPro - Cancel (or un-cancel) your own subscription
 *
 * Cancels at PERIOD END, never immediately: the customer has already paid for
 * the current period, so cutting access the moment they click would be taking
 * money for time they cannot use. Stripe keeps the subscription active until
 * the period closes and then emits customer.subscription.deleted, which is
 * what actually flips our record to `cancelled`.
 *
 * Scoped by userId from the session — like /api/billing/me, there is no way to
 * name a different account.
 *
 * The same endpoint reverses the decision (`{ resume: true }`). A cancellation
 * scheduled for a month away with no way back would send every change of mind
 * through support.
 */

import { NextRequest } from "next/server";
import Stripe from "stripe";
import { Subscription } from "@/models";
import { UserRole } from "@/types";
import {
  createErrorResponse,
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { serializeSubscription } from "@/lib/billing/serialize";

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user, request: NextRequest) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return createErrorResponse(
          "Billing is not configured. Please get in touch and we'll sort it out.",
          503
        );
      }

      const body = await request.json().catch(() => ({}));
      const resume = body?.resume === true;

      const account = await Subscription.findOne({
        userId: user.id,
        deletedAt: null,
      }).sort({ createdAt: -1 });

      if (!account) {
        return createErrorResponse("There is no subscription to cancel", 404);
      }

      if (account.status === "cancelled" || account.status === "expired") {
        return createErrorResponse(
          "This subscription has already ended",
          409
        );
      }

      // A cash account is a negotiated arrangement an admin recorded by hand.
      // Cancelling it here would tell Stripe to cancel a subscription that does
      // not exist there, and silently end a client's billing without anyone
      // agreeing to it. Refuse and say who can.
      if (!account.stripeSubscriptionId) {
        return createErrorResponse(
          "This account is billed manually. Please contact us to make changes.",
          409
        );
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      // Stripe is the source of truth, so it is updated FIRST. Writing our copy
      // first and failing here would leave the app showing a cancellation that
      // is not scheduled anywhere, and the customer would still be charged.
      const updated = await stripe.subscriptions.update(
        account.stripeSubscriptionId,
        { cancel_at_period_end: !resume }
      );

      account.cancelAtPeriodEnd = updated.cancel_at_period_end ?? !resume;
      await account.save();

      return createSuccessResponse(
        { subscription: serializeSubscription(account) },
        resume
          ? "Your subscription will continue."
          : "Your subscription will end at the close of the current period."
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
