/**
 * PropertyPro - Core Payment Service
 * Essential payment processing with status transitions, late fees, and proration
 */

import Stripe from "stripe";
import { stripeConfig, paymentConfig } from "@/lib/config/environment";
import {
  EnhancedPayment,
  EnhancedTenant,
  EnhancedProperty,
} from "@/lib/database/schema-updates";
import { emailService } from "./email.service";

// Initialize Stripe
const stripe = new Stripe(stripeConfig.secretKey, {
  apiVersion: stripeConfig.apiVersion,
});

export interface PaymentStatusTransition {
  from: PaymentStatus;
  to: PaymentStatus;
  reason?: string;
  metadata?: Record<string, any>;
}

export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PAID = "paid",
  FAILED = "failed",
  OVERDUE = "overdue",
  CANCELLED = "cancelled",
}

export interface PaymentProcessingResult {
  success: boolean;
  paymentId: string;
  stripePaymentIntentId?: string;
  amount: number;
  status: PaymentStatus;
  processingTime: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface LateFeeCalculation {
  amount: number;
  appliedDate: Date;
  gracePeriodEnd: Date;
  feeStructure: {
    type: "fixed" | "percentage" | "tiered" | "daily";
    rate: number;
    maxAmount?: number;
  };
  daysLate: number;
  waived: boolean;
}

export interface ProrationCalculation {
  originalAmount: number;
  proratedAmount: number;
  prorationType: "move_in" | "move_out" | "mid_month_change";
  periodStart: Date;
  periodEnd: Date;
  daysInPeriod: number;
  daysOccupied: number;
  calculationMethod: "daily" | "calendar_month";
}

class CorePaymentService {
  /**
   * Process a payment with full status management
   */
  async processPayment(
    paymentId: string,
    paymentMethodId: string,
    amount: number,
    tenantId: string
  ): Promise<PaymentProcessingResult> {
    const startTime = Date.now();

    try {
      // Get payment record
      const payment = await EnhancedPayment.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Transition to processing
      await this.transitionPaymentStatus(
        paymentId,
        PaymentStatus.PROCESSING,
        "Payment initiated"
      );

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        payment_method: paymentMethodId,
        confirmation_method: "manual",
        confirm: true,
        metadata: {
          paymentId,
          tenantId,
          propertyId: payment.propertyId.toString(),
        },
      });

      // Update payment with Stripe details
      await EnhancedPayment.findByIdAndUpdate(paymentId, {
        "processing.stripePaymentIntentId": paymentIntent.id,
        "processing.processingTime": Date.now() - startTime,
      });

      // Handle payment intent status
      if (paymentIntent.status === "succeeded") {
        await this.transitionPaymentStatus(
          paymentId,
          PaymentStatus.PAID,
          "Payment succeeded"
        );
        await this.handleSuccessfulPayment(paymentId, paymentIntent);

        return {
          success: true,
          paymentId,
          stripePaymentIntentId: paymentIntent.id,
          amount,
          status: PaymentStatus.PAID,
          processingTime: Date.now() - startTime,
        };
      } else if (paymentIntent.status === "requires_action") {
        // Handle 3D Secure or other authentication
        return {
          success: false,
          paymentId,
          stripePaymentIntentId: paymentIntent.id,
          amount,
          status: PaymentStatus.PROCESSING,
          processingTime: Date.now() - startTime,
          error: "Payment requires additional authentication",
          metadata: {
            clientSecret: paymentIntent.client_secret,
            requiresAction: true,
          },
        };
      } else {
        await this.transitionPaymentStatus(
          paymentId,
          PaymentStatus.FAILED,
          "Payment failed"
        );
        await this.handleFailedPayment(paymentId, "Payment intent failed");

        return {
          success: false,
          paymentId,
          stripePaymentIntentId: paymentIntent.id,
          amount,
          status: PaymentStatus.FAILED,
          processingTime: Date.now() - startTime,
          error: "Payment failed",
        };
      }
    } catch (error) {
      await this.transitionPaymentStatus(
        paymentId,
        PaymentStatus.FAILED,
        error instanceof Error ? error.message : "Unknown error"
      );
      await this.handleFailedPayment(
        paymentId,
        error instanceof Error ? error.message : "Unknown error"
      );

      return {
        success: false,
        paymentId,
        amount,
        status: PaymentStatus.FAILED,
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Transition payment status with audit trail
   */
  async transitionPaymentStatus(
    paymentId: string,
    newStatus: PaymentStatus,
    reason?: string,
    performedBy?: string
  ): Promise<void> {
    const payment = await EnhancedPayment.findById(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    const oldStatus = payment.status;

    // Validate status transition
    if (!this.isValidStatusTransition(oldStatus as PaymentStatus, newStatus)) {
      throw new Error(
        `Invalid status transition from ${oldStatus} to ${newStatus}`
      );
    }

    // Update payment status and add audit trail
    await EnhancedPayment.findByIdAndUpdate(paymentId, {
      status: newStatus,
      ...(newStatus === PaymentStatus.PAID && { paidDate: new Date() }),
      $push: {
        auditTrail: {
          action: `Status changed from ${oldStatus} to ${newStatus}`,
          performedBy,
          timestamp: new Date(),
          details: { reason, oldStatus, newStatus },
        },
      },
    });


  }

  /**
   * Calculate and apply late fees
   */
  async calculateLateFee(
    paymentId: string
  ): Promise<LateFeeCalculation | null> {
    const payment = await EnhancedPayment.findById(paymentId).populate(
      "propertyId"
    );
    if (!payment) {
      throw new Error("Payment not found");
    }

    const property = payment.propertyId as any;
    const lateFeeConfig = property.paymentConfiguration?.lateFees;

    if (!lateFeeConfig?.enabled) {
      return null;
    }

    const now = new Date();
    const dueDate = new Date(payment.dueDate);
    const gracePeriodEnd = new Date(
      dueDate.getTime() + lateFeeConfig.gracePeriodDays * 24 * 60 * 60 * 1000
    );

    // Check if payment is past grace period
    if (now <= gracePeriodEnd) {
      return null;
    }

    const daysLate = Math.floor(
      (now.getTime() - gracePeriodEnd.getTime()) / (24 * 60 * 60 * 1000)
    );
    let lateFeeAmount = 0;

    // Calculate late fee based on structure type
    switch (lateFeeConfig.feeStructure.type) {
      case "fixed":
        lateFeeAmount = lateFeeConfig.feeStructure.fixedAmount || 0;
        break;
      case "percentage":
        lateFeeAmount =
          payment.amount * ((lateFeeConfig.feeStructure.percentage || 0) / 100);
        break;
      case "daily":
        lateFeeAmount =
          (lateFeeConfig.feeStructure.dailyAmount || 0) * daysLate;
        break;
      case "tiered":
        // Find appropriate tier
        const tiers = lateFeeConfig.feeStructure.tieredRates || [];
        const applicableTier = tiers
          .filter((tier) => daysLate >= tier.daysLate)
          .sort((a, b) => b.daysLate - a.daysLate)[0];
        lateFeeAmount = applicableTier?.amount || 0;
        break;
    }

    // Apply maximum fee limit
    if (lateFeeConfig.maximumFee && lateFeeAmount > lateFeeConfig.maximumFee) {
      lateFeeAmount = lateFeeConfig.maximumFee;
    }

    return {
      amount: lateFeeAmount,
      appliedDate: now,
      gracePeriodEnd,
      feeStructure: {
        type: lateFeeConfig.feeStructure.type,
        rate:
          lateFeeConfig.feeStructure.fixedAmount ||
          lateFeeConfig.feeStructure.percentage ||
          0,
        maxAmount: lateFeeConfig.maximumFee,
      },
      daysLate,
      waived: false,
    };
  }

  /**
   * Apply late fee to payment
   */
  async applyLateFee(paymentId: string): Promise<void> {
    const lateFeeCalculation = await this.calculateLateFee(paymentId);
    if (!lateFeeCalculation) {
      return;
    }

    await EnhancedPayment.findByIdAndUpdate(paymentId, {
      "lateFee.amount": lateFeeCalculation.amount,
      "lateFee.appliedDate": lateFeeCalculation.appliedDate,
      "lateFee.gracePeriodEnd": lateFeeCalculation.gracePeriodEnd,
      "lateFee.autoApplied": true,
      "lateFee.feeStructure": lateFeeCalculation.feeStructure,
      $push: {
        auditTrail: {
          action: "Late fee applied",
          timestamp: new Date(),
          details: lateFeeCalculation,
        },
      },
    });

    // Send late fee notification
    await this.sendLateFeeNotification(paymentId, lateFeeCalculation.amount);
  }

  /**
   * Calculate prorated rent amount
   */
  calculateProration(
    monthlyRent: number,
    moveInDate: Date,
    moveOutDate: Date | null,
    calculationMethod: "daily" | "calendar_month" = "daily"
  ): ProrationCalculation {
    const periodStart = new Date(
      moveInDate.getFullYear(),
      moveInDate.getMonth(),
      1
    );
    const periodEnd =
      moveOutDate ||
      new Date(moveInDate.getFullYear(), moveInDate.getMonth() + 1, 0);

    const daysInMonth = new Date(
      moveInDate.getFullYear(),
      moveInDate.getMonth() + 1,
      0
    ).getDate();
    const daysOccupied =
      Math.floor(
        (periodEnd.getTime() - moveInDate.getTime()) / (24 * 60 * 60 * 1000)
      ) + 1;

    let proratedAmount: number;

    if (calculationMethod === "daily") {
      const dailyRate = monthlyRent / daysInMonth;
      proratedAmount = dailyRate * daysOccupied;
    } else {
      // Calendar month method
      proratedAmount = (monthlyRent / daysInMonth) * daysOccupied;
    }

    return {
      originalAmount: monthlyRent,
      proratedAmount: Math.round(proratedAmount * 100) / 100, // Round to 2 decimal places
      prorationType: moveOutDate ? "move_out" : "move_in",
      periodStart,
      periodEnd,
      daysInPeriod: daysInMonth,
      daysOccupied,
      calculationMethod,
    };
  }

  /**
   * Generate recurring payments
   */
  async generateRecurringPayments(
    tenantId: string,
    propertyId: string
  ): Promise<string[]> {
    const tenant = await EnhancedTenant.findById(tenantId);
    const property = await EnhancedProperty.findById(propertyId);

    if (!tenant || !property) {
      throw new Error("Tenant or property not found");
    }

    const rentAmount = tenant.leaseInfo?.rentAmount || 0;
    const nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    nextDueDate.setDate(1); // First of next month

    const paymentData = {
      tenantId,
      propertyId,
      amount: rentAmount,
      dueDate: nextDueDate,
      status: PaymentStatus.PENDING,
      paymentMethod:
        tenant.paymentPreferences?.preferredMethod || "credit_card",
      scheduling: {
        isRecurring: true,
        recurringType: "monthly",
        autoGenerated: true,
        schedulingRules: {
          dayOfMonth: 1,
          monthsInterval: 1,
        },
      },
      metadata: {
        source: "auto_generated",
        tags: ["rent", "recurring"],
      },
    };

    const payment = await EnhancedPayment.create(paymentData);

    // Schedule payment reminder
    await this.schedulePaymentReminder(payment._id.toString());

    return [payment._id.toString()];
  }

  /**
   * Validate status transitions
   */
  private isValidStatusTransition(
    from: PaymentStatus,
    to: PaymentStatus
  ): boolean {
    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.PENDING]: [
        PaymentStatus.PROCESSING,
        PaymentStatus.CANCELLED,
        PaymentStatus.OVERDUE,
      ],
      [PaymentStatus.PROCESSING]: [PaymentStatus.PAID, PaymentStatus.FAILED],
      [PaymentStatus.PAID]: [], // Terminal state
      [PaymentStatus.FAILED]: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
      [PaymentStatus.OVERDUE]: [
        PaymentStatus.PROCESSING,
        PaymentStatus.PAID,
        PaymentStatus.CANCELLED,
      ],
      [PaymentStatus.CANCELLED]: [], // Terminal state
    };

    return validTransitions[from]?.includes(to) || false;
  }

  /**
   * Handle successful payment
   */
  private async handleSuccessfulPayment(
    paymentId: string,
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> {
    // Update payment with Stripe charge details
    await EnhancedPayment.findByIdAndUpdate(paymentId, {
      "processing.stripeChargeId": paymentIntent.charges.data[0]?.id,
      "processing.processingFee":
        paymentIntent.charges.data[0]?.application_fee_amount || 0,
      "processing.netAmount":
        (paymentIntent.amount -
          (paymentIntent.charges.data[0]?.application_fee_amount || 0)) /
        100,
      paidDate: new Date(),
    });

    // Send confirmation
    await this.sendPaymentConfirmation(paymentId);

    // Update tenant payment summary
    await this.updateTenantPaymentSummary(paymentId);
  }

  /**
   * Handle failed payment
   */
  private async handleFailedPayment(
    paymentId: string,
    reason: string
  ): Promise<void> {
    await EnhancedPayment.findByIdAndUpdate(paymentId, {
      "processing.failureReason": reason,
      "processing.retryCount": { $inc: 1 },
      "processing.lastRetryDate": new Date(),
    });

    // Send failure notification
    await this.sendPaymentFailureNotification(paymentId, reason);
  }

  /**
   * Send payment confirmation
   */
  private async sendPaymentConfirmation(paymentId: string): Promise<void> {
    const payment = await EnhancedPayment.findById(paymentId).populate(
      "tenantId"
    );
    if (!payment) return;

    const tenant = payment.tenantId as any;

    // Send email confirmation
    if (tenant.paymentPreferences?.communicationPreferences?.email) {
      await emailService.sendPaymentConfirmation(tenant.email, {
        amount: payment.amount,
        paymentDate: payment.paidDate || new Date(),
        paymentMethod: payment.paymentMethod,
      });
    }

    // SMS notification disabled - service not configured
  }

  /**
   * Send payment failure notification
   */
  private async sendPaymentFailureNotification(
    paymentId: string,
    reason: string
  ): Promise<void> {
    const payment = await EnhancedPayment.findById(paymentId).populate(
      "tenantId"
    );
    if (!payment) return;

    const tenant = payment.tenantId as any;

    // Send email notification
    if (tenant.paymentPreferences?.communicationPreferences?.email) {
      await emailService.sendPaymentFailure(tenant.email, {
        amount: payment.amount,
        dueDate: payment.dueDate,
        reason,
      });
    }
  }

  /**
   * Send late fee notification
   */
  private async sendLateFeeNotification(
    paymentId: string,
    lateFeeAmount: number
  ): Promise<void> {
    const payment = await EnhancedPayment.findById(paymentId).populate(
      "tenantId"
    );
    if (!payment) return;

    const tenant = payment.tenantId as any;

    // Send email notification
    if (tenant.paymentPreferences?.communicationPreferences?.email) {
      await emailService.sendLateFeeNotification(tenant.email, {
        originalAmount: payment.amount,
        lateFeeAmount,
        totalDue: payment.amount + lateFeeAmount,
        dueDate: payment.dueDate,
      });
    }
  }

  /**
   * Schedule payment reminder
   */
  private async schedulePaymentReminder(paymentId: string): Promise<void> {
    // This would integrate with a job scheduler like Bull or Agenda

  }

  /**
   * Update tenant payment summary
   */
  private async updateTenantPaymentSummary(paymentId: string): Promise<void> {
    const payment = await EnhancedPayment.findById(paymentId);
    if (!payment) return;

    await EnhancedTenant.findByIdAndUpdate(payment.tenantId, {
      $inc: {
        "paymentSummary.totalPaid": payment.amount,
        "paymentSummary.onTimePayments": 1,
      },
      "paymentSummary.lastPaymentDate": payment.paidDate,
    });
  }
}

export const corePaymentService = new CorePaymentService();
