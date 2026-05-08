/**
 * PropertyPro - Tenant Recurring Payments API
 * Handles CRUD operations for tenant recurring payment setups
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { RecurringPayment } from "@/models";
import { Payment } from "@/models";
import { Lease } from "@/models";
import { UserRole } from "@/types";
import Stripe from "stripe";
import {
  createSuccessResponse as createApiSuccessResponse,
  createErrorResponse as createApiErrorResponse,
} from "@/lib/api-utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// ============================================================================
// GET - Fetch tenant's recurring payment setup
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse(
        "Authentication required",
        401,
        "Authentication required"
      );
    }

    if (session.user.role !== UserRole.TENANT) {
      return createApiErrorResponse(
        "Access denied. Tenant role required.",
        403,
        "Access denied. Tenant role required."
      );
    }

    await connectDB();

    // Find the tenant's recurring payment setup
    const recurringPayment = await RecurringPayment.findOne({
      tenantId: session.user.id,
    })
      .populate("propertyId", "name address")
      .populate("leaseId", "startDate endDate")
      .lean();

    return createApiSuccessResponse<typeof recurringPayment | null>(
      recurringPayment ?? null,
      "Recurring payment setup fetched successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to fetch recurring payment setup";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// POST - Create new recurring payment setup
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse(
        "Authentication required",
        401,
        "Authentication required"
      );
    }

    if (session.user.role !== UserRole.TENANT) {
      return createApiErrorResponse(
        "Access denied. Tenant role required.",
        403,
        "Access denied. Tenant role required."
      );
    }

    const body = await request.json();
    const {
      propertyId,
      leaseId,
      amount,
      frequency,
      dayOfMonth,
      dayOfWeek,
      isActive = true,
    } = body;

    // Validation
    if (!propertyId || !leaseId || !amount || !frequency) {
      return createApiErrorResponse(
        "Missing required fields",
        400,
        "Missing required fields"
      );
    }

    if (amount <= 0) {
      return createApiErrorResponse(
        "Amount must be greater than 0",
        400,
        "Amount must be greater than 0"
      );
    }

    if (!["monthly", "weekly", "bi-weekly"].includes(frequency)) {
      return createApiErrorResponse(
        "Invalid frequency",
        400,
        "Invalid frequency"
      );
    }

    await connectDB();

    // Verify the lease belongs to the tenant
    const lease = await Lease.findOne({
      _id: leaseId,
      tenantId: session.user.id,
      status: "active",
    });

    if (!lease) {
      return createApiErrorResponse(
        "Active lease not found",
        404,
        "Active lease not found"
      );
    }

    // Check if recurring payment already exists
    const existingSetup = await RecurringPayment.findOne({
      tenantId: session.user.id,
      leaseId,
    });

    if (existingSetup) {
      return createApiErrorResponse(
        "Recurring payment setup already exists",
        409,
        "Recurring payment setup already exists"
      );
    }

    // Calculate next payment date
    const nextPaymentDate = calculateNextPaymentDate(
      frequency,
      dayOfMonth,
      dayOfWeek
    );

    // Create Stripe subscription if active
    let stripeSubscriptionId;
    if (isActive) {
      try {
        // Create Stripe customer if doesn't exist
        let customerId = session.user.stripeCustomerId;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: session.user.email!,
            name: session.user.name!,
            metadata: {
              userId: session.user.id,
              tenantId: session.user.id,
            },
          });
          customerId = customer.id;
        }

        // Create subscription
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Rent Payment - ${lease.propertyId.name}`,
                },
                unit_amount: Math.round(amount * 100), // Convert to cents
                recurring: {
                  interval: frequency === "monthly" ? "month" : "week",
                  interval_count: frequency === "bi-weekly" ? 2 : 1,
                },
              },
            },
          ],
          payment_behavior: "default_incomplete",
          payment_settings: { save_default_payment_method: "on_subscription" },
          expand: ["latest_invoice.payment_intent"],
        });

        stripeSubscriptionId = subscription.id;
      } catch (stripeError) {
        const message =
          stripeError instanceof Error
            ? stripeError.message
            : "Failed to create payment subscription";
        return createApiErrorResponse(message, 500, message);
      }
    }

    // Create recurring payment setup
    const recurringPayment = new RecurringPayment({
      tenantId: session.user.id,
      propertyId,
      leaseId,
      amount,
      frequency,
      dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
      dayOfWeek: frequency !== "monthly" ? dayOfWeek : undefined,
      isActive,
      stripeSubscriptionId,
      nextPaymentDate,
    });

    await recurringPayment.save();

    // Populate the response
    await recurringPayment.populate("propertyId", "name address");
    await recurringPayment.populate("leaseId", "startDate endDate");

    return createApiSuccessResponse<typeof recurringPayment>(
      recurringPayment,
      "Recurring payment setup created successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create recurring payment setup";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateNextPaymentDate(
  frequency: string,
  dayOfMonth?: number,
  dayOfWeek?: number
): Date {
  const now = new Date();
  let nextDate = new Date();

  switch (frequency) {
    case "monthly":
      nextDate.setDate(dayOfMonth || 1);
      if (nextDate <= now) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      break;
    case "weekly":
      const daysUntilNext = ((dayOfWeek || 1) - now.getDay() + 7) % 7;
      nextDate.setDate(now.getDate() + (daysUntilNext || 7));
      break;
    case "bi-weekly":
      const daysUntilNextBiWeekly = ((dayOfWeek || 1) - now.getDay() + 7) % 7;
      nextDate.setDate(now.getDate() + (daysUntilNextBiWeekly || 14));
      break;
  }

  return nextDate;
}
