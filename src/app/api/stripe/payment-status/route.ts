/**
 * PropertyPro - Stripe Payment Status API
 * Check payment status and retrieve payment details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Payment } from "@/models";
import { UserRole, PaymentStatus, PaymentMethod } from "@/types";
import { stripePaymentService } from "@/lib/services/stripe-payment.service";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
} from "@/lib/api-utils";

// GET /api/stripe/payment-status?payment_intent_id=pi_xxx
export async function GET(request: NextRequest) {
  try {

    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const { searchParams } = new URL(request.url);
    const paymentIntentId = searchParams.get("payment_intent_id");

    if (!paymentIntentId) {
      return createErrorResponse("Payment intent ID is required", 400);
    }

    // Find payment record
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntentId,
    })
      .populate("tenantId", "firstName lastName email")
      .populate("propertyId", "name")
      .populate("invoiceId", "invoiceNumber totalAmount balanceRemaining");

    if (!payment) {
      return createErrorResponse("Payment not found", 404);
    }

    // Check permissions
    const userRole = (session.user.role as UserRole) || UserRole.TENANT;
    const userId = session.user.id;

    if (
      userRole === UserRole.TENANT &&
      payment.tenantId._id.toString() !== userId
    ) {
      return createErrorResponse("Access denied", 403);
    }

    // Get Stripe payment intent status
    const stripePayment = await stripePaymentService.getPaymentIntent(
      paymentIntentId
    );

    return createSuccessResponse(
      {
        payment: {
          id: payment._id,
          amount: payment.amount,
          amountPaid: payment.amountPaid,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          paidDate: payment.paidDate,
          createdAt: payment.createdAt,
          description: payment.description,
        },
        stripePayment: {
          id: stripePayment.id,
          status: stripePayment.status,
          amount: stripePayment.amount,
          currency: stripePayment.currency,
          paymentMethodId: stripePayment.paymentMethodId,
        },
        invoice: payment.invoiceId
          ? {
              id: payment.invoiceId._id,
              invoiceNumber: payment.invoiceId.invoiceNumber,
              totalAmount: payment.invoiceId.totalAmount,
              balanceRemaining: payment.invoiceId.balanceRemaining,
            }
          : null,
        tenant: {
          id: payment.tenantId._id,
          name: `${payment.tenantId.firstName} ${payment.tenantId.lastName}`,
          email: payment.tenantId.email,
        },
        property: {
          id: payment.propertyId._id,
          name: payment.propertyId.name,
        },
      },
      "Payment status retrieved successfully"
    );
  } catch (error) {
    console.error("Error in GET /api/stripe/payment-status:", error);
    return handleApiError(error);
  }
}

// POST /api/stripe/payment-status - Update payment status from webhook or manual check
export async function POST(request: NextRequest) {
  try {

    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;
    const userId = session.user.id;

    const body = await request.json();
    const { paymentIntentId, forceRefresh = false } = body;

    if (!paymentIntentId) {
      return createErrorResponse("Payment intent ID is required", 400);
    }

    // Find payment record
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntentId,
    });

    if (!payment) {
      return createErrorResponse("Payment not found", 404);
    }

    // Get latest status from Stripe
    const stripePayment = await stripePaymentService.getPaymentIntent(
      paymentIntentId
    );

    const isStaff = [
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.MANAGER,
      UserRole.MANAGER,
      UserRole.MANAGER,
    ].includes(userRole);

    if (!isStaff) {
      if (userRole === UserRole.TENANT) {
        if (payment.tenantId.toString() !== userId) {
          return createErrorResponse("Access denied", 403);
        }
      } else {
        return createErrorResponse("Insufficient permissions", 403);
      }
    }

    // Update payment status based on Stripe status
    let statusUpdated = false;
    const originalStatus = payment.status;
    const syncErrors: string[] = [];


    if (
      stripePayment.status === "succeeded" &&
      payment.status !== PaymentStatus.COMPLETED
    ) {

      payment.status = PaymentStatus.COMPLETED;
      payment.paidDate = new Date();
      // Service helper already returns normalized dollar amount
      payment.amountPaid = stripePayment.amount;
      payment.paymentMethod =
        payment.paymentMethod || PaymentMethod.CREDIT_CARD;

      // Add to payment history
      const paymentHistoryEntry = {
        amount: payment.amountPaid,
        paymentMethod: payment.paymentMethod,
        paidDate: new Date(),
        transactionId: stripePayment.id,
        notes: "Payment confirmed via Stripe status check",
      };

      if (!payment.paymentHistory) {
        payment.paymentHistory = [];
      }
      payment.paymentHistory.push(paymentHistoryEntry);

      statusUpdated = true;
    } else if (
      stripePayment.status === "canceled" &&
      payment.status !== PaymentStatus.CANCELLED
    ) {

      payment.status = PaymentStatus.CANCELLED;
      statusUpdated = true;
    } else if (
      stripePayment.status === "requires_payment_method" &&
      payment.status !== PaymentStatus.FAILED
    ) {

      payment.status = PaymentStatus.FAILED;
      statusUpdated = true;
    } else if (
      stripePayment.status === "processing" &&
      payment.status !== PaymentStatus.PROCESSING
    ) {

      payment.status = PaymentStatus.PROCESSING;
      statusUpdated = true;
    }

    const shouldSyncInvoices =
      payment.status === PaymentStatus.COMPLETED &&
      (statusUpdated || forceRefresh);


    if (statusUpdated || forceRefresh) {
      try {
        await payment.save();

      } catch (saveError) {
        console.error("Error saving payment:", saveError);
        syncErrors.push(
          `Failed to save payment: ${
            saveError instanceof Error ? saveError.message : "Unknown error"
          }`
        );
      }

      // If payment was completed, sync with invoices
      if (shouldSyncInvoices && syncErrors.length === 0) {
        try {
          // Update specific invoice if linked
          if (payment.invoiceId) {

            const { Invoice } = await import("@/models");
            const invoice = await Invoice.findById(payment.invoiceId);
            if (invoice) {
              const appliedAmount =
                typeof payment.amountPaid === "number" && payment.amountPaid > 0
                  ? payment.amountPaid
                  : stripePayment.amount;


              // Use the method directly - it exists on the model instance
              if (typeof (invoice as any).addPayment === "function") {
                await (invoice as any).addPayment(payment._id, appliedAmount);

              } else {
                // Manual update if method doesn't exist
                if (!invoice.paymentIds.includes(payment._id)) {
                  invoice.paymentIds.push(payment._id);
                }
                invoice.amountPaid += appliedAmount;
                invoice.balanceRemaining = invoice.totalAmount - invoice.amountPaid;
                invoice.lastPaymentDate = new Date();

                // Update status
                if (invoice.balanceRemaining <= 0) {
                  invoice.status = "paid" as any;
                } else if (invoice.amountPaid > 0) {
                  invoice.status = "partial" as any;
                }

                await invoice.save();

              }
            } else {
              syncErrors.push(`Invoice ${payment.invoiceId} not found`);
              console.error("Invoice not found:", payment.invoiceId);
            }
          } else {

            // Apply to oldest unpaid invoices for the tenant
            const { paymentInvoiceLinkingService } = await import(
              "@/lib/services/payment-invoice-linking.service"
            );

            const amountToApply = payment.amountPaid || stripePayment.amount;
            const linkingResult =
              await paymentInvoiceLinkingService.applyPaymentToInvoices(
                payment._id.toString(),
                payment.tenantId.toString(),
                amountToApply,
                payment.leaseId?.toString()
              );


            if (!linkingResult.success) {
              syncErrors.push(...linkingResult.errors);
            }
          }
        } catch (error) {
          console.error("Invoice sync error:", error);
          syncErrors.push(
            `Invoice sync failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    }

    return createSuccessResponse(
      {
        payment: {
          id: payment._id,
          status: payment.status,
          originalStatus,
          statusUpdated,
          amount: payment.amount,
          amountPaid: payment.amountPaid,
          paidDate: payment.paidDate,
        },
        stripePayment: {
          id: stripePayment.id,
          status: stripePayment.status,
          amount: stripePayment.amount,
        },
        sync: {
          invoiceSyncErrors: syncErrors,
          invoiceSyncSuccess: syncErrors.length === 0,
        },
      },
      statusUpdated
        ? syncErrors.length > 0
          ? "Payment status updated with sync warnings"
          : "Payment status updated successfully"
        : "Payment status is current"
    );
  } catch (error) {
    console.error("Error in POST /api/stripe/payment-status:", error);
    return handleApiError(error);
  }
}
