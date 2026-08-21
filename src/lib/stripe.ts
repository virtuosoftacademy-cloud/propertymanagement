/**
 * PropertyPro - Stripe Integration
 * Stripe payment processing utilities and webhook handling
 */

import Stripe from "stripe";
import { Payment } from "@/models";
import { PaymentStatus } from "@/types";
import { formatCurrency } from "@/lib/utils/formatting";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export { stripe };

// ============================================================================
// PAYMENT INTENT CREATION
// ============================================================================

export interface CreatePaymentIntentParams {
  amount: number; // Amount in cents
  currency?: string;
  paymentId: string;
  tenantEmail: string;
  description?: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent({
  amount,
  currency = "usd",
  paymentId,
  tenantEmail,
  description,
  metadata = {},
}: CreatePaymentIntentParams): Promise<Stripe.PaymentIntent> {
  try {
    // Validate amount is within Stripe's limits
    if (amount < 0.50 || amount > 999999.99) {
      throw new Error("Amount must be between $0.50 and $999,999.99");
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        receipt_email: tenantEmail,
        description: description || "Property rent payment",
        metadata: {
          paymentId,
          source: "PropertyPro",
          ...metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      },
      {
        idempotencyKey: `payment-intent-${paymentId}-${Date.now()}`,
      }
    );

    // Update payment record with Stripe payment intent ID using model to trigger hooks
    const payment = await Payment.findById(paymentId);
    if (payment) {
      payment.stripePaymentIntentId = paymentIntent.id;
      payment.status = PaymentStatus.PROCESSING;
      await payment.save();
    }

    return paymentIntent;
  } catch (error) {
    console.error("Error creating payment intent:", error);
    if (error instanceof Stripe.errors.StripeError) {
      throw new Error(`Stripe error (${error.type}): ${error.message}`);
    }
    throw error instanceof Error ? error : new Error("Failed to create payment intent");
  }
}

// ============================================================================
// PAYMENT CONFIRMATION
// ============================================================================

export async function confirmPayment(
  paymentIntentId: string
): Promise<boolean> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === "succeeded") {
      // Find and update the payment record
      const payment = await Payment.findOne({
        stripePaymentIntentId: paymentIntentId,
      });

      if (payment) {
        payment.status = PaymentStatus.COMPLETED;
        payment.paidDate = new Date();
        await payment.save();
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error confirming payment:", error);
    return false;
  }
}

// ============================================================================
// REFUND PROCESSING
// ============================================================================

export interface CreateRefundParams {
  paymentIntentId: string;
  amount?: number; // Amount in cents, if partial refund
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  metadata?: Record<string, string>;
}

export async function createRefund({
  paymentIntentId,
  amount,
  reason = "requested_by_customer",
  metadata = {},
}: CreateRefundParams): Promise<Stripe.Refund> {
  try {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      reason,
      metadata: {
        source: "PropertyPro",
        ...metadata,
      },
    };

    if (amount) {
      refundParams.amount = Math.round(amount * 100); // Convert to cents
    }

    const refund = await stripe.refunds.create(refundParams);

    // Update payment record
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntentId,
    });

    if (payment) {
      payment.status = PaymentStatus.REFUNDED;
      await payment.save();
    }

    return refund;
  } catch (error) {
    console.error("Error creating refund:", error);
    throw new Error("Failed to create refund");
  }
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

export async function createOrUpdateCustomer(
  email: string,
  name: string,
  phone?: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  try {
    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      // Update existing customer
      const customer = await stripe.customers.update(
        existingCustomers.data[0].id,
        {
          name,
          phone,
          metadata: {
            source: "PropertyPro",
            ...metadata,
          },
        }
      );
      return customer;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email,
        name,
        phone,
        metadata: {
          source: "PropertyPro",
          ...metadata,
        },
      });
      return customer;
    }
  } catch (error) {
    console.error("Error creating/updating customer:", error);
    throw new Error("Failed to create/update customer");
  }
}

// ============================================================================
// WEBHOOK HANDLING
// ============================================================================

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("Error constructing webhook event:", error);
    throw new Error("Invalid webhook signature");
  }
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  try {

    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.processing":
        await handlePaymentProcessing(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "payment_intent.requires_action":
        await handlePaymentRequiresAction(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case "payment_intent.canceled":
        await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
        break;

      case "charge.dispute.created":
        await handleChargeDispute(event.data.object as Stripe.Dispute);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice
        );
        break;

      case "customer.created":
        await handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      case "payment_method.attached":
        await handlePaymentMethodAttached(
          event.data.object as Stripe.PaymentMethod
        );
        break;

      // Subscription events for recurring payments
      case "customer.subscription.created":
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "invoice.upcoming":
        await handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
        break;

      default:

    }


  } catch (error) {
    console.error(
      `Error handling webhook event ${event.type} (${event.id}):`,
      error
    );
    throw error;
  }
}

async function handlePaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const { paymentSyncLogger, PaymentSyncAction } = await import(
    "@/lib/services/payment-sync-logger.service"
  );

  try {
    await paymentSyncLogger.logSuccess(
      paymentIntent.id,
      PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED,
      "Stripe payment_intent.succeeded webhook received",
      {
        stripePaymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
      }
    );

    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      await paymentSyncLogger.logError(
        paymentIntent.id,
        PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED,
        `Payment not found for Stripe payment intent: ${paymentIntent.id}`,
        {
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
        }
      );
      return;
    }

    // Update payment status and details
    payment.status = PaymentStatus.COMPLETED;
    payment.paidDate = new Date();
    payment.amountPaid = paymentIntent.amount / 100; // Convert from cents

    // Add to payment history
    payment.paymentHistory.push({
      amount: paymentIntent.amount / 100,
      paymentMethod: "credit_card", // Stripe payment
      paidDate: new Date(),
      transactionId: paymentIntent.id,
      notes: "Payment processed via Stripe",
    });

    await payment.save();

    await paymentSyncLogger.logSuccess(
      payment._id.toString(),
      PaymentSyncAction.PAYMENT_STATUS_UPDATED,
      "Payment status updated to completed",
      {
        paymentId: payment._id.toString(),
        tenantId: payment.tenantId.toString(),
        propertyId: payment.propertyId?.toString(),
        leaseId: payment.leaseId?.toString(),
        amount: payment.amountPaid,
        stripePaymentIntentId: paymentIntent.id,
      }
    );

    // Sync with invoice if payment is linked to an invoice
    if (payment.invoiceId) {
      try {
        const { Invoice } = await import("@/models");
        const invoice = await Invoice.findById(payment.invoiceId);

        if (invoice) {
          // Add payment to invoice and update status
          await invoice.addPayment(payment._id, payment.amountPaid);

          await paymentSyncLogger.logSuccess(
            payment._id.toString(),
            PaymentSyncAction.INVOICE_PAYMENT_ADDED,
            `Invoice ${invoice._id} updated with payment ${payment._id}`,
            {
              paymentId: payment._id.toString(),
              invoiceId: invoice._id.toString(),
              tenantId: payment.tenantId.toString(),
              amount: payment.amountPaid,
            }
          );
        } else {
          await paymentSyncLogger.logError(
            payment._id.toString(),
            PaymentSyncAction.INVOICE_PAYMENT_ADDED,
            `Invoice ${payment.invoiceId} not found for payment ${payment._id}`,
            {
              paymentId: payment._id.toString(),
              invoiceId: payment.invoiceId.toString(),
              tenantId: payment.tenantId.toString(),
            }
          );
        }
      } catch (error) {
        await paymentSyncLogger.logError(
          payment._id.toString(),
          PaymentSyncAction.INVOICE_PAYMENT_ADDED,
          error instanceof Error
            ? error.message
            : "Unknown error updating invoice",
          {
            paymentId: payment._id.toString(),
            invoiceId: payment.invoiceId.toString(),
            tenantId: payment.tenantId.toString(),
            error: error instanceof Error ? error : new Error(String(error)),
          }
        );
      }
    }

    // If no specific invoice, try to apply to oldest unpaid invoices for the tenant
    if (!payment.invoiceId && payment.tenantId) {
      try {
        const { paymentInvoiceLinkingService } = await import(
          "@/lib/services/payment-invoice-linking.service"
        );
        const linkingResult =
          await paymentInvoiceLinkingService.applyPaymentToInvoices(
            payment._id.toString(),
            payment.tenantId.toString(),
            payment.amountPaid,
            payment.leaseId?.toString()
          );

        if (linkingResult.success) {
          await paymentSyncLogger.logSuccess(
            payment._id.toString(),
            PaymentSyncAction.PAYMENT_INVOICE_LINKED,
            `Payment applied to ${linkingResult.applicationsApplied.length} invoice(s)`,
            {
              paymentId: payment._id.toString(),
              tenantId: payment.tenantId.toString(),
              applicationsCount: linkingResult.applicationsApplied.length,
              totalAmountApplied: linkingResult.totalAmountApplied,
            }
          );
        } else {
          await paymentSyncLogger.logWarning(
            payment._id.toString(),
            PaymentSyncAction.PAYMENT_INVOICE_LINKED,
            `Failed to apply payment to invoices: ${linkingResult.errors.join(
              ", "
            )}`,
            {
              paymentId: payment._id.toString(),
              tenantId: payment.tenantId.toString(),
              errors: linkingResult.errors,
            }
          );
        }
      } catch (error) {
        await paymentSyncLogger.logError(
          payment._id.toString(),
          PaymentSyncAction.PAYMENT_INVOICE_LINKED,
          error instanceof Error
            ? error.message
            : "Unknown error linking payment to invoices",
          {
            paymentId: payment._id.toString(),
            tenantId: payment.tenantId.toString(),
            error: error instanceof Error ? error : new Error(String(error)),
          }
        );
      }
    }

    await paymentSyncLogger.logSuccess(
      payment._id.toString(),
      PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED,
      "Payment successfully processed and synced with invoices",
      {
        paymentId: payment._id.toString(),
        tenantId: payment.tenantId.toString(),
        amount: payment.amountPaid,
        stripePaymentIntentId: paymentIntent.id,
      }
    );
  } catch (error) {
    await paymentSyncLogger.logError(
      paymentIntent.id,
      PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED,
      error instanceof Error
        ? error.message
        : "Unknown error handling payment success",
      {
        stripePaymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
    throw error;
  }
}

async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const { paymentSyncLogger, PaymentSyncAction } = await import(
    "@/lib/services/payment-sync-logger.service"
  );

  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      await paymentSyncLogger.logError(
        paymentIntent.id,
        PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED,
        `Payment not found for failed Stripe payment intent: ${paymentIntent.id}`,
        {
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
        }
      );
      return;
    }

    // Update payment status with failure details
    payment.status = PaymentStatus.FAILED;

    // Add failure details to payment history
    const errorMessage =
      paymentIntent.last_payment_error?.message || "Unknown error";
    payment.paymentHistory.push({
      amount: 0,
      paymentMethod: "credit_card",
      paidDate: new Date(),
      transactionId: paymentIntent.id,
      notes: `Payment failed: ${errorMessage}`,
    });

    await payment.save();

    await paymentSyncLogger.logError(
      payment._id.toString(),
      PaymentSyncAction.PAYMENT_STATUS_UPDATED,
      `Payment marked as failed: ${errorMessage}`,
      {
        paymentId: payment._id.toString(),
        tenantId: payment.tenantId.toString(),
        propertyId: payment.propertyId?.toString(),
        leaseId: payment.leaseId?.toString(),
        amount: payment.amount,
        stripePaymentIntentId: paymentIntent.id,
        errorCode: paymentIntent.last_payment_error?.code,
      }
    );
  } catch (error) {
    await paymentSyncLogger.logError(
      paymentIntent.id,
      PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED,
      error instanceof Error
        ? error.message
        : "Unknown error handling payment failure",
      {
        stripePaymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
    throw error;
  }
}

async function handleChargeDispute(dispute: Stripe.Dispute): Promise<void> {
  // Handle charge disputes - could involve updating payment status
  // and notifying property managers

}

async function handlePaymentProcessing(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await Payment.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (payment) {
    payment.status = PaymentStatus.PROCESSING;
    await payment.save();


  }
}

async function handlePaymentRequiresAction(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await Payment.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (payment) {
    payment.status = PaymentStatus.PENDING;
    await payment.save();


  }
}

async function handlePaymentCanceled(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await Payment.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (payment) {
    payment.status = PaymentStatus.FAILED;
    await payment.save();


  }
}

async function handleCustomerCreated(customer: Stripe.Customer): Promise<void> {

  // Could update tenant records with Stripe customer ID if needed
}

async function handlePaymentMethodAttached(
  paymentMethod: Stripe.PaymentMethod
): Promise<void> {

  // Could store payment method details for future use
}

/**
 * Fields that MOVED on Stripe's invoice object.
 *
 * `invoice.subscription`, `invoice.payment_intent` and `invoice.charge` were
 * removed in the 2025-x API versions; this account is on 2026-04-22.dahlia,
 * where they live under `parent.subscription_details` and `payments[]`.
 *
 * Reading the old names returned undefined, and an undefined value is stripped
 * from a Mongoose query rather than matched — so
 * `findOne({ stripeSubscriptionId: invoice.subscription })` degraded to
 * `findOne({})` and returned an ARBITRARY recurring-payment record. That is
 * how a rent payment could be filed against the wrong tenant, so the callers
 * below bail out when there is no id rather than querying with a blank filter.
 *
 * Both shapes are read: an event created under an older version, or replayed
 * from the dashboard, still carries the flat field.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const legacy = (invoice as any).subscription;
  if (legacy)
    return typeof legacy === "string" ? legacy : (legacy.id as string);

  const current = (invoice as any).parent?.subscription_details?.subscription;
  if (!current) return undefined;
  return typeof current === "string" ? current : (current.id as string);
}

/** The PaymentIntent that settled an invoice. Now one per entry in payments[]. */
function invoicePaymentIntentId(invoice: Stripe.Invoice): string | undefined {
  const legacy = (invoice as any).payment_intent;
  if (legacy)
    return typeof legacy === "string" ? legacy : (legacy.id as string);

  for (const entry of ((invoice as any).payments?.data ?? []) as any[]) {
    const intent = entry?.payment?.payment_intent;
    if (intent) return typeof intent === "string" ? intent : intent.id;
  }
  return undefined;
}

/**
 * The end of the period an invoice covers — i.e. what the rent was paid FOR.
 *
 * The line item's period, not `invoice.period_end`: on a subscription's first
 * invoice the invoice-level window collapses to the moment of issue, which
 * would date a rent payment to the day the tenancy started and then schedule
 * the next one from that same wrong date.
 */
function invoicePeriodEnd(invoice: Stripe.Invoice): number | undefined {
  return (
    ((invoice.lines?.data?.[0] as any)?.period?.end as number | undefined) ??
    ((invoice as any).period_end as number | undefined)
  );
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  // Handle recurring payment success

  // Find the recurring payment setup
  const subscriptionId = invoiceSubscriptionId(invoice);
  // No id means this invoice is not tied to a subscription. Querying anyway
  // would match an arbitrary tenant (see invoiceSubscriptionId above).
  if (!subscriptionId) return;

  const RecurringPayment = (await import("@/models/RecurringPayment")).default;
  const recurringPayment = await RecurringPayment.findOne({
    stripeSubscriptionId: subscriptionId,
  });

  if (recurringPayment) {
    // Create a new payment record for this recurring payment
    const Payment = (await import("@/models/Payment")).default;
    const payment = new Payment({
      tenantId: recurringPayment.tenantId,
      propertyId: recurringPayment.propertyId,
      leaseId: recurringPayment.leaseId,
      amount: invoice.amount_paid / 100, // Convert from cents
      type: "rent",
      status: PaymentStatus.COMPLETED,
      dueDate: new Date(invoicePeriodEnd(invoice)! * 1000),
      paidDate: new Date(invoice.status_transitions.paid_at! * 1000),
      stripePaymentIntentId: invoicePaymentIntentId(invoice),
      description: `Recurring rent payment - ${new Date().toLocaleDateString()}`,
    });

    await payment.save();

    // Update next payment date
    const nextDate = new Date(invoicePeriodEnd(invoice)! * 1000);
    switch (recurringPayment.frequency) {
      case "monthly":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case "weekly":
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "bi-weekly":
        nextDate.setDate(nextDate.getDate() + 14);
        break;
    }

    recurringPayment.nextPaymentDate = nextDate;
    await recurringPayment.save();


  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {

  // Find the recurring payment setup
  const subscriptionId = invoiceSubscriptionId(invoice);
  // No id means this invoice is not tied to a subscription. Querying anyway
  // would match an arbitrary tenant (see invoiceSubscriptionId above).
  if (!subscriptionId) return;

  const RecurringPayment = (await import("@/models/RecurringPayment")).default;
  const recurringPayment = await RecurringPayment.findOne({
    stripeSubscriptionId: subscriptionId,
  });

  if (recurringPayment) {
    // Create a failed payment record
    const Payment = (await import("@/models/Payment")).default;
    const payment = new Payment({
      tenantId: recurringPayment.tenantId,
      propertyId: recurringPayment.propertyId,
      leaseId: recurringPayment.leaseId,
      amount: invoice.amount_due / 100, // Convert from cents
      type: "rent",
      status: PaymentStatus.FAILED,
      dueDate: new Date(invoicePeriodEnd(invoice)! * 1000),
      stripePaymentIntentId: invoicePaymentIntentId(invoice),
      description: `Failed recurring rent payment - ${new Date().toLocaleDateString()}`,
    });

    await payment.save();

    // Send notification about failed payment
    const PaymentNotification = (await import("@/models/PaymentNotification")).default;
    const notification = new PaymentNotification({
      tenantId: recurringPayment.tenantId,
      paymentId: payment._id,
      type: "overdue",
      status: "pending",
      scheduledDate: new Date(),
      emailAddress: invoice.customer_email || "",
      subject: "Payment Failed - Action Required",
      message: `Your recurring rent payment of ${formatCurrency(payment.amount)} has failed. Please update your payment method or make a manual payment.`,
    });

    await notification.save();


  }
}

async function handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {

  // Send reminder notification for upcoming payment
  const subscriptionId = invoiceSubscriptionId(invoice);
  // No id means this invoice is not tied to a subscription. Querying anyway
  // would match an arbitrary tenant (see invoiceSubscriptionId above).
  if (!subscriptionId) return;

  const RecurringPayment = (await import("@/models/RecurringPayment")).default;
  const recurringPayment = await RecurringPayment.findOne({
    stripeSubscriptionId: subscriptionId,
  });

  if (recurringPayment) {
    const PaymentNotification = (await import("@/models/PaymentNotification")).default;
    const notification = new PaymentNotification({
      tenantId: recurringPayment.tenantId,
      paymentId: null, // No payment record yet
      type: "reminder",
      status: "pending",
      scheduledDate: new Date(),
      emailAddress: invoice.customer_email || "",
      subject: "Upcoming Rent Payment",
      message: `Your recurring rent payment of ${formatCurrency(
        invoice.amount_due / 100
      )} will be processed on ${new Date(
        invoicePeriodEnd(invoice)! * 1000
      ).toLocaleDateString()}.`,
    });

    await notification.save();


  }
}

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {

  // Find the recurring payment setup and update it with the subscription ID
  const RecurringPayment = (await import("@/models/RecurringPayment")).default;
  const recurringPayment = await RecurringPayment.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (recurringPayment) {
    recurringPayment.isActive = subscription.status === "active";
    await recurringPayment.save();


  }
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {

  // Update the recurring payment setup
  const RecurringPayment = (await import("@/models/RecurringPayment")).default;
  const recurringPayment = await RecurringPayment.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (recurringPayment) {
    recurringPayment.isActive = subscription.status === "active";

    // Update amount if changed
    if (subscription.items.data.length > 0) {
      const item = subscription.items.data[0];
      if (item.price.unit_amount) {
        recurringPayment.amount = item.price.unit_amount / 100; // Convert from cents
      }
    }

    await recurringPayment.save();


  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {

  // Deactivate the recurring payment setup
  const RecurringPayment = (await import("@/models/RecurringPayment")).default;
  const recurringPayment = await RecurringPayment.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (recurringPayment) {
    recurringPayment.isActive = false;
    await recurringPayment.save();

    // Send notification about cancelled subscription
    const PaymentNotification = (await import("@/models/PaymentNotification")).default;
    const notification = new PaymentNotification({
      tenantId: recurringPayment.tenantId,
      paymentId: null,
      type: "confirmation",
      status: "pending",
      scheduledDate: new Date(),
      emailAddress: "", // Will need to get from tenant record
      subject: "Recurring Payment Cancelled",
      message:
        "Your recurring rent payment has been cancelled. You will need to make manual payments going forward.",
    });

    await notification.save();


  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function formatStripeAmount(amount: number): number {
  return Math.round(amount * 100); // Convert dollars to cents
}

export function formatDisplayAmount(stripeAmount: number): number {
  return stripeAmount / 100; // Convert cents to dollars
}

export function isValidStripeAmount(amount: number): boolean {
  return amount >= 0.5 && amount <= 999999.99; // Stripe limits
}

export async function getPaymentMethods(
  customerId: string
): Promise<Stripe.PaymentMethod[]> {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    return paymentMethods.data;
  } catch (error) {
    console.error("Error retrieving payment methods:", error);
    return [];
  }
}
