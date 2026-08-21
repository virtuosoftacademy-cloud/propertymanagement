/**
 * PropertyPro - Manager accounts API
 *
 * The accounts the admin has sold. Admin-only: this is the org's own revenue
 * ledger, not something a manager or tenant has any business reading.
 */

import { NextRequest } from "next/server";
import { Subscription, User } from "@/models";
import { UserRole } from "@/types";
import type { SubscriptionsView } from "@/types/billing";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import { managerAccountFormSchema } from "@/lib/billing/manager-account-schema";
import {
  serializeSubscription,
  loadVisibleSubscriptions,
} from "@/lib/billing/serialize";
import { summariseSubscriptions } from "@/lib/billing/summarise";

// ============================================================================
// GET /api/billing/subscriptions - list with derived summary
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    // Same visibility rule as analytics — see loadVisibleSubscriptions.
    const { docs, names, hidden } = await loadVisibleSubscriptions(
      Subscription,
      User
    );

    if (hidden > 0) {
      // Not silent: the revenue below now excludes these, and an admin
      // chasing a client that vanished needs somewhere to see why.
      console.warn(
        `[billing] ${hidden} subscription(s) hidden — their user is deleted`
      );
    }

    const accounts = docs.map((d) =>
      serializeSubscription(d, names.get(String(d.userId ?? "")))
    );

    const view: SubscriptionsView = {
      summary: summariseSubscriptions(accounts),
      accounts,
    };

    return createSuccessResponse(view);
  } catch (error) {
    return handleApiError(error);
  }
});

// ============================================================================
// POST /api/billing/subscriptions - record a newly sold account
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (_user, request: NextRequest) => {
    try {
      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      // Same rules the dialog applies, re-run here: client-side validation is a
      // convenience, not a guarantee.
      const parsed = managerAccountFormSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const values = parsed.data;

      const created = await Subscription.create({
        clientName: values.clientName,
        companyName: values.companyName,
        contactEmail: values.contactEmail,
        contactPhone: values.contactPhone,
        userId: values.clientUserId,
        planId: values.planId,
        status: values.status,
        amount: values.amount,
        billingCycle: values.billingCycle,
        startedAt: new Date(values.startedAt),
        renewsAt: values.renewsAt ? new Date(values.renewsAt) : null,
        // Accounts created here are sold directly and settled in cash; the
        // Stripe path creates its own account from the webhook instead.
        paymentMethod: "cash",
        notes: values.notes,
      });

      return createSuccessResponse(
        serializeSubscription(created as any),
        "Manager account created"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
