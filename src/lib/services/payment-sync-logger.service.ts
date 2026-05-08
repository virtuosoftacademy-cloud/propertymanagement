/**
 * PropertyPro - Payment Synchronization Logger Service
 * Comprehensive logging and error handling for payment-invoice synchronization
 */

import { Types } from "mongoose";

export interface PaymentSyncLog {
  paymentId: string;
  invoiceId?: string;
  tenantId: string;
  propertyId?: string;
  leaseId?: string;
  action: PaymentSyncAction;
  status: "success" | "warning" | "error";
  details: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  stripePaymentIntentId?: string;
  amount?: number;
  errorCode?: string;
  stackTrace?: string;
}

export enum PaymentSyncAction {
  STRIPE_WEBHOOK_RECEIVED = "stripe_webhook_received",
  PAYMENT_STATUS_UPDATED = "payment_status_updated",
  INVOICE_PAYMENT_ADDED = "invoice_payment_added",
  INVOICE_STATUS_UPDATED = "invoice_status_updated",
  PAYMENT_HISTORY_ADDED = "payment_history_added",
  PAYMENT_INVOICE_LINKED = "payment_invoice_linked",
  PAYMENT_INVOICE_UNLINKED = "payment_invoice_unlinked",
  SYNC_FAILURE_DETECTED = "sync_failure_detected",
  SYNC_RECOVERY_ATTEMPTED = "sync_recovery_attempted",
  MANUAL_SYNC_TRIGGERED = "manual_sync_triggered",
}

export interface SyncError {
  code: string;
  message: string;
  context: Record<string, any>;
  severity: "low" | "medium" | "high" | "critical";
  recoverable: boolean;
}

class PaymentSyncLoggerService {
  private logs: PaymentSyncLog[] = [];
  private maxLogsInMemory = 1000;

  /**
   * Log a payment synchronization event
   */
  async logSyncEvent(
    paymentId: string,
    action: PaymentSyncAction,
    status: "success" | "warning" | "error",
    details: string,
    metadata?: {
      invoiceId?: string;
      tenantId?: string;
      propertyId?: string;
      leaseId?: string;
      stripePaymentIntentId?: string;
      amount?: number;
      errorCode?: string;
      error?: Error;
    }
  ): Promise<void> {
    const log: PaymentSyncLog = {
      paymentId,
      invoiceId: metadata?.invoiceId,
      tenantId: metadata?.tenantId || "",
      propertyId: metadata?.propertyId,
      leaseId: metadata?.leaseId,
      action,
      status,
      details,
      metadata: metadata ? { ...metadata, error: undefined } : undefined,
      timestamp: new Date(),
      stripePaymentIntentId: metadata?.stripePaymentIntentId,
      amount: metadata?.amount,
      errorCode: metadata?.errorCode,
      stackTrace: metadata?.error?.stack,
    };

    // Add to in-memory logs
    this.logs.push(log);

    // Keep only recent logs in memory
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.maxLogsInMemory);
    }

    // Log to console with appropriate level
    const logMessage = `[PaymentSync] ${action}: ${details}`;
    const logData = {
      paymentId,
      invoiceId: metadata?.invoiceId,
      tenantId: metadata?.tenantId,
      amount: metadata?.amount,
      stripePaymentIntentId: metadata?.stripePaymentIntentId,
    };

    switch (status) {
      case "success":

        break;
      case "warning":
        console.warn(logMessage, logData);
        break;
      case "error":
        console.error(logMessage, logData, metadata?.error);
        break;
    }

    // In a production environment, you would also persist to database
    // await this.persistLog(log);
  }

  /**
   * Log successful payment synchronization
   */
  async logSuccess(
    paymentId: string,
    action: PaymentSyncAction,
    details: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logSyncEvent(paymentId, action, "success", details, metadata);
  }

  /**
   * Log payment synchronization warning
   */
  async logWarning(
    paymentId: string,
    action: PaymentSyncAction,
    details: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logSyncEvent(paymentId, action, "warning", details, metadata);
  }

  /**
   * Log payment synchronization error
   */
  async logError(
    paymentId: string,
    action: PaymentSyncAction,
    error: Error | string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorObj = error instanceof Error ? error : new Error(error);

    await this.logSyncEvent(paymentId, action, "error", errorMessage, {
      ...metadata,
      error: errorObj,
      errorCode: this.getErrorCode(errorObj),
    });
  }

  /**
   * Get recent logs for a specific payment
   */
  getPaymentLogs(paymentId: string): PaymentSyncLog[] {
    return this.logs.filter((log) => log.paymentId === paymentId);
  }

  /**
   * Get recent error logs
   */
  getErrorLogs(limit: number = 50): PaymentSyncLog[] {
    return this.logs
      .filter((log) => log.status === "error")
      .slice(-limit)
      .reverse();
  }

  /**
   * Get sync statistics
   */
  getSyncStats(timeframe: "hour" | "day" | "week" = "day"): {
    total: number;
    success: number;
    warnings: number;
    errors: number;
    successRate: number;
  } {
    const now = new Date();
    const cutoff = new Date();

    switch (timeframe) {
      case "hour":
        cutoff.setHours(now.getHours() - 1);
        break;
      case "day":
        cutoff.setDate(now.getDate() - 1);
        break;
      case "week":
        cutoff.setDate(now.getDate() - 7);
        break;
    }

    const recentLogs = this.logs.filter((log) => log.timestamp >= cutoff);
    const total = recentLogs.length;
    const success = recentLogs.filter((log) => log.status === "success").length;
    const warnings = recentLogs.filter(
      (log) => log.status === "warning"
    ).length;
    const errors = recentLogs.filter((log) => log.status === "error").length;

    return {
      total,
      success,
      warnings,
      errors,
      successRate: total > 0 ? (success / total) * 100 : 0,
    };
  }

  /**
   * Detect sync failures and patterns
   */
  detectSyncFailures(): {
    criticalErrors: PaymentSyncLog[];
    repeatedFailures: { paymentId: string; count: number; lastError: string }[];
    recommendations: string[];
  } {
    const criticalErrors = this.logs.filter(
      (log) =>
        log.status === "error" &&
        (log.action === PaymentSyncAction.STRIPE_WEBHOOK_RECEIVED ||
          log.action === PaymentSyncAction.INVOICE_PAYMENT_ADDED)
    );

    // Group errors by payment ID to find repeated failures
    const errorsByPayment = new Map<string, PaymentSyncLog[]>();
    this.logs
      .filter((log) => log.status === "error")
      .forEach((log) => {
        if (!errorsByPayment.has(log.paymentId)) {
          errorsByPayment.set(log.paymentId, []);
        }
        errorsByPayment.get(log.paymentId)!.push(log);
      });

    const repeatedFailures = Array.from(errorsByPayment.entries())
      .filter(([_, errors]) => errors.length > 1)
      .map(([paymentId, errors]) => ({
        paymentId,
        count: errors.length,
        lastError: errors[errors.length - 1].details,
      }));

    const recommendations: string[] = [];

    if (criticalErrors.length > 0) {
      recommendations.push(
        "Critical sync errors detected - immediate attention required"
      );
    }

    if (repeatedFailures.length > 0) {
      recommendations.push(
        "Repeated failures detected - check payment data integrity"
      );
    }

    const stats = this.getSyncStats("hour");
    if (stats.successRate < 90 && stats.total > 10) {
      recommendations.push(
        "Low success rate detected - investigate system issues"
      );
    }

    return {
      criticalErrors,
      repeatedFailures,
      recommendations,
    };
  }

  /**
   * Generate error code from error object
   */
  private getErrorCode(error: Error): string {
    if (error.message.includes("Invoice not found")) return "INVOICE_NOT_FOUND";
    if (error.message.includes("Payment not found")) return "PAYMENT_NOT_FOUND";
    if (error.message.includes("Stripe")) return "STRIPE_ERROR";
    if (error.message.includes("Database")) return "DATABASE_ERROR";
    if (error.message.includes("Network")) return "NETWORK_ERROR";
    return "UNKNOWN_ERROR";
  }

  /**
   * Clear old logs (would typically be called by a cleanup job)
   */
  clearOldLogs(olderThanDays: number = 30): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    this.logs = this.logs.filter((log) => log.timestamp >= cutoff);
  }
}

// Export singleton instance
export const paymentSyncLogger = new PaymentSyncLoggerService();
