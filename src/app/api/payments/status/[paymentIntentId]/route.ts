/**
 * PropertyPro - Payment Status API
 * Check Stripe payment intent status
 */

import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { Payment } from "@/models";
import { UserRole, PaymentStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";

// ============================================================================
// GET /api/payments/status/[paymentIntentId] - Check payment status
// ============================================================================

export const GET = withRoleAndDB(
  [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT],
  async (
    user,
    request: NextRequest,
    { params }: { params: { paymentIntentId: string } }
  ) => {
    try {
      const { paymentIntentId } = params;

      if (!paymentIntentId) {
        return createErrorResponse("Payment intent ID is required", 400);
      }

      // Retrieve payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      // Find the associated payment record
      const payment = await Payment.findOne({
        stripePaymentIntentId: paymentIntentId,
      }).populate({
        path: "tenantId",
        populate: {
          path: "userId",
          select: "firstName lastName email",
        },
      });

      if (!payment) {
        return createErrorResponse("Payment record not found", 404);
      }

      // Role-based authorization
      if (user.role === UserRole.TENANT) {
        const tenantUserId = payment.tenantId.userId._id.toString();
        if (tenantUserId !== user.id) {
          return createErrorResponse(
            "You can only check status of your own payments",
            403
          );
        }
      }

      // Sync payment status with Stripe if needed
      let updatedPayment = payment;
      if (payment.status !== paymentIntent.status) {
        switch (paymentIntent.status) {
          case "succeeded":
            payment.status = PaymentStatus.COMPLETED;
            payment.paidDate = new Date();
            break;
          case "processing":
            payment.status = PaymentStatus.PROCESSING;
            break;
          case "requires_payment_method":
          case "requires_confirmation":
          case "requires_action":
            payment.status = PaymentStatus.PENDING;
            break;
          case "canceled":
          case "payment_failed":
            payment.status = PaymentStatus.FAILED;
            break;
        }
        updatedPayment = await payment.save();
      }

      return createSuccessResponse(
        {
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100, // Convert from cents
          currency: paymentIntent.currency,
          paymentMethod: paymentIntent.payment_method_types,
          created: new Date(paymentIntent.created * 1000),
          payment: {
            id: updatedPayment._id,
            status: updatedPayment.status,
            amount: updatedPayment.amount,
            type: updatedPayment.type,
            dueDate: updatedPayment.dueDate,
            paidDate: updatedPayment.paidDate,
          },
        },
        "Payment status retrieved successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
