/**
 * PropertyPro - Individual Recurring Payment API
 * Handles update and delete operations for specific recurring payment setups
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { RecurringPayment } from "@/models";
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
// PUT - Update recurring payment setup
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const { amount, frequency, dayOfMonth, dayOfWeek, isActive } = body;

    await connectDB();

    // Find the recurring payment setup
    const recurringPayment = await RecurringPayment.findOne({
      _id: params.id,
      tenantId: session.user.id,
    });

    if (!recurringPayment) {
      return createApiErrorResponse(
        "Recurring payment setup not found",
        404,
        "Recurring payment setup not found"
      );
    }

    // Validation
    if (amount !== undefined && amount <= 0) {
      return createApiErrorResponse(
        "Amount must be greater than 0",
        400,
        "Amount must be greater than 0"
      );
    }

    if (frequency && !["monthly", "weekly", "bi-weekly"].includes(frequency)) {
      return createApiErrorResponse(
        "Invalid frequency",
        400,
        "Invalid frequency"
      );
    }

    // Update Stripe subscription if it exists
    if (recurringPayment.stripeSubscriptionId) {
      try {
        if (isActive === false) {
          // Cancel the subscription
          await stripe.subscriptions.cancel(
            recurringPayment.stripeSubscriptionId
          );
        } else {
          // Update the subscription
          const updateData: any = {};

          if (amount !== undefined) {
            // Update the subscription item with new amount
            const subscription = await stripe.subscriptions.retrieve(
              recurringPayment.stripeSubscriptionId,
              { expand: ["items"] }
            );

            if (subscription.items.data.length > 0) {
              updateData.items = [
                {
                  id: subscription.items.data[0].id,
                  price_data: {
                    currency: "usd",
                    product_data: {
                      name: `Rent Payment - Updated`,
                    },
                    unit_amount: Math.round(amount * 100),
                    recurring: {
                      interval:
                        (frequency || recurringPayment.frequency) === "monthly"
                          ? "month"
                          : "week",
                      interval_count:
                        (frequency || recurringPayment.frequency) ===
                        "bi-weekly"
                          ? 2
                          : 1,
                    },
                  },
                },
              ];
            }
          }

          if (Object.keys(updateData).length > 0) {
            await stripe.subscriptions.update(
              recurringPayment.stripeSubscriptionId,
              updateData
            );
          }
        }
      } catch (stripeError) {
        const message =
          stripeError instanceof Error
            ? stripeError.message
            : "Failed to update payment subscription";
        return createApiErrorResponse(message, 500, message);
      }
    } else if (isActive === true) {
      // Create new subscription if activating
      try {
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

        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Rent Payment`,
                },
                unit_amount: Math.round(
                  (amount || recurringPayment.amount) * 100
                ),
                recurring: {
                  interval:
                    (frequency || recurringPayment.frequency) === "monthly"
                      ? "month"
                      : "week",
                  interval_count:
                    (frequency || recurringPayment.frequency) === "bi-weekly"
                      ? 2
                      : 1,
                },
              },
            },
          ],
          payment_behavior: "default_incomplete",
          payment_settings: { save_default_payment_method: "on_subscription" },
        });

        recurringPayment.stripeSubscriptionId = subscription.id;
      } catch (stripeError) {
        const message =
          stripeError instanceof Error
            ? stripeError.message
            : "Failed to create payment subscription";
        return createApiErrorResponse(message, 500, message);
      }
    }

    // Update the recurring payment setup
    if (amount !== undefined) recurringPayment.amount = amount;
    if (frequency !== undefined) {
      recurringPayment.frequency = frequency;
      recurringPayment.dayOfMonth =
        frequency === "monthly" ? dayOfMonth : undefined;
      recurringPayment.dayOfWeek =
        frequency !== "monthly" ? dayOfWeek : undefined;
    }
    if (isActive !== undefined) recurringPayment.isActive = isActive;

    // Recalculate next payment date
    recurringPayment.nextPaymentDate = calculateNextPaymentDate(
      recurringPayment.frequency,
      recurringPayment.dayOfMonth,
      recurringPayment.dayOfWeek
    );

    await recurringPayment.save();

    // Populate the response
    await recurringPayment.populate("propertyId", "name address");
    await recurringPayment.populate("leaseId", "startDate endDate");

    return createApiSuccessResponse<typeof recurringPayment>(
      recurringPayment,
      "Recurring payment setup updated successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update recurring payment setup";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// DELETE - Cancel recurring payment setup
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Find the recurring payment setup
    const recurringPayment = await RecurringPayment.findOne({
      _id: params.id,
      tenantId: session.user.id,
    });

    if (!recurringPayment) {
      return createApiErrorResponse(
        "Recurring payment setup not found",
        404,
        "Recurring payment setup not found"
      );
    }

    let warningMessage: string | null = null;

    // Cancel Stripe subscription if it exists
    if (recurringPayment.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(
          recurringPayment.stripeSubscriptionId
        );
      } catch (stripeError) {
        warningMessage =
          stripeError instanceof Error
            ? stripeError.message
            : "Stripe subscription cancellation failed";
        // Continue with deletion even if Stripe fails
      }
    }

    // Delete the recurring payment setup
    await RecurringPayment.findByIdAndDelete(params.id);

    const response = createApiSuccessResponse<null>(
      null,
      warningMessage
        ? "Recurring payment setup cancelled with warnings"
        : "Recurring payment setup cancelled successfully"
    );

    if (warningMessage) {
      response.headers.set("x-propertypro-warning", warningMessage);
    }

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to cancel recurring payment setup";

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
