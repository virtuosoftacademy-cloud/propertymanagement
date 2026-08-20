/**
 * PropertyPro - Subscription payments
 *
 * Payments are EMBEDDED on the subscription document, so this endpoint reads
 * across subscriptions and flattens their arrays rather than querying a second
 * collection. Card rows are written by the Stripe webhook; this records cash.
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { Subscription } from "@/models";
import { UserRole } from "@/types";
import type { SubscriptionPaymentsView } from "@/types/billing";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import { flattenPayments, serializePayment } from "@/lib/billing/serialize";
import { summarisePayments } from "@/lib/billing/summarise";

const recordPaymentSchema = z.object({
  subscriptionId: z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), "Select a subscription"),
  amount: z
    .number({ invalid_type_error: "Enter an amount" })
    .positive("Amount must be greater than zero")
    .max(1_000_000, "Amount is too large"),
  receivedOn: z.string().min(1, "Received date is required"),
  periodLabel: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000, "Notes are too long").optional(),
});

// ============================================================================
// GET /api/billing/payments
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN])(
  async (_user, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const subscriptionId = searchParams.get("subscriptionId");

      const filter: Record<string, unknown> = {};
      if (subscriptionId) {
        if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
          return createErrorResponse("Invalid subscription id", 400);
        }
        filter._id = subscriptionId;
      }

      const docs = await Subscription.find(filter).lean();
      // flattenPayments sorts newest first — a ledger is read backwards from
      // the most recent payment.
      const payments = flattenPayments(docs as any[]);

      const view: SubscriptionPaymentsView = {
        summary: summarisePayments(payments),
        payments,
      };

      return createSuccessResponse(view);
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// POST /api/billing/payments - record a cash payment
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      const parsed = recordPaymentSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const v = parsed.data;

      const subscription = await Subscription.findById(v.subscriptionId);
      if (!subscription) {
        return createErrorResponse("Subscription not found", 404);
      }

      if (subscription.stripeSubscriptionId) {
        return createErrorResponse(
          "This subscription is billed through Stripe. Its payments are written from Stripe invoices — recording one by hand would double-count the revenue.",
          409
        );
      }

      const receivedOn = new Date(v.receivedOn);
      if (Number.isNaN(receivedOn.getTime())) {
        return createErrorResponse("Invalid received date", 400);
      }

      subscription.payments.push({
        amount: v.amount,
        receivedOn,
        method: "cash",
        recordedBy:
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.email,
        periodLabel: v.periodLabel,
        notes: v.notes,
      } as any);

      // A received payment is what makes a subscription current.
      subscription.lastPaymentAt = receivedOn;
      if (subscription.status === "past_due" || subscription.status === "pending") {
        subscription.status = "active";
      }
      await subscription.save();

      const added = subscription.payments[subscription.payments.length - 1];

      return createSuccessResponse(
        serializePayment(added, subscription),
        "Payment recorded"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
