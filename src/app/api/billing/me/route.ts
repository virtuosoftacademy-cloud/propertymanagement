/**
 * PropertyPro - The signed-in account's own subscription
 *
 * The self-serve counterpart to /api/billing/subscriptions, which is the
 * admin's revenue ledger across every client. This returns exactly one
 * subscription — the caller's — so a manager can see what they pay for
 * without being able to read anyone else's.
 *
 * Scoped by userId rather than by any id in the request: there is deliberately
 * no way to ask this endpoint for a different account.
 */

import { Subscription } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { serializeSubscription, flattenPayments } from "@/lib/billing/serialize";
import { getPlan } from "@/lib/billing/plan-store";
import { getUnitAllowance } from "@/lib/billing/unit-limit";

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user) => {
    try {
      // Newest first: an account that has re-subscribed after cancelling has
      // more than one row, and the current one is what they came to look at.
      const doc = await Subscription.findOne({
        userId: user.id,
        deletedAt: null,
      }).sort({ createdAt: -1 });

      // What the account may actually do, which is a property of the ROLE
      // rather than of the subscription — an admin-granted plan, or an account
      // predating billing, has permissions without a subscription record.
      const allowance = await getUnitAllowance(user as any, 0);
      const plan = await getPlan(allowance.planId);

      return createSuccessResponse({
        subscription: doc ? serializeSubscription(doc) : null,
        payments: doc ? flattenPayments([doc]) : [],
        usage: {
          planId: allowance.planId,
          planName: allowance.planName,
          limit: allowance.limit,
          used: allowance.used,
        },
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              description: plan.description,
              monthlyPrice: plan.monthlyPrice,
              annualPrice: plan.annualPrice,
              features: plan.features,
            }
          : null,
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);
