/**
 * PropertyPro - Payment Status Hook
 * Real-time payment status tracking and updates
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

export interface PaymentStatus {
  paymentIntentId: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "succeeded"
    | "canceled";
  amount: number;
  currency: string;
  lastUpdated: Date;
  error?: string;
}

export interface UsePaymentStatusOptions {
  paymentIntentId?: string;
  pollInterval?: number; // milliseconds
  maxRetries?: number;
  onStatusChange?: (status: PaymentStatus) => void;
  onSuccess?: (paymentIntentId: string) => void;
  onError?: (error: string) => void;
}

export function usePaymentStatus({
  paymentIntentId,
  pollInterval = 2000, // 2 seconds
  maxRetries = 30, // 1 minute total
  onStatusChange,
  onSuccess,
  onError,
}: UsePaymentStatusOptions = {}) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPaymentStatus = useCallback(
    async (intentId: string): Promise<PaymentStatus | null> => {
      try {
        // Cancel previous request if still pending
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        const response = await fetch(
          `/api/stripe/payment-status?paymentIntentId=${intentId}`,
          {
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success || !data.data) {
          throw new Error(data.error || "Failed to fetch payment status");
        }

        const paymentData = data.data;

        const paymentStatus: PaymentStatus = {
          paymentIntentId: paymentData.id,
          status: paymentData.status,
          amount: paymentData.amount,
          currency: paymentData.currency,
          lastUpdated: new Date(),
          error: paymentData.error,
        };

        return paymentStatus;
      } catch (err: any) {
        if (err.name === "AbortError") {
          return null; // Request was cancelled, ignore
        }

        console.error("Error fetching payment status:", err);
        throw err;
      }
    },
    []
  );

  const startPolling = useCallback(
    (intentId: string) => {
      if (isPolling || !intentId) return;

      setIsPolling(true);
      setError(null);
      setRetryCount(0);

      const poll = async () => {
        try {
          const newStatus = await fetchPaymentStatus(intentId);

          if (!newStatus) return; // Request was cancelled

          setStatus(newStatus);
          setRetryCount(0); // Reset retry count on successful fetch

          // Call status change callback
          if (onStatusChange) {
            onStatusChange(newStatus);
          }

          // Check for terminal states
          if (newStatus.status === "succeeded") {
            stopPolling();
            if (onSuccess) {
              onSuccess(newStatus.paymentIntentId);
            }
            toast.success("Payment completed successfully!");
          } else if (newStatus.status === "canceled") {
            stopPolling();
            const errorMsg = "Payment was canceled";
            setError(errorMsg);
            if (onError) {
              onError(errorMsg);
            }
            toast.error("Payment was canceled");
          } else if (newStatus.error) {
            stopPolling();
            setError(newStatus.error);
            if (onError) {
              onError(newStatus.error);
            }
            toast.error(`Payment failed: ${newStatus.error}`);
          }
        } catch (err: any) {
          console.error("Polling error:", err);
          setRetryCount((prev) => prev + 1);

          if (retryCount >= maxRetries) {
            stopPolling();
            const errorMsg = "Payment status check timed out";
            setError(errorMsg);
            if (onError) {
              onError(errorMsg);
            }
            toast.error(
              "Payment status check timed out. Please refresh the page."
            );
          }
        }
      };

      // Initial poll
      poll();

      // Set up interval
      intervalRef.current = setInterval(poll, pollInterval);
    },
    [
      isPolling,
      fetchPaymentStatus,
      onStatusChange,
      onSuccess,
      onError,
      maxRetries,
      pollInterval,
      retryCount,
    ]
  );

  const stopPolling = useCallback(() => {
    setIsPolling(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const checkPaymentStatus = useCallback(
    async (intentId: string) => {
      try {
        const newStatus = await fetchPaymentStatus(intentId);
        if (newStatus) {
          setStatus(newStatus);
          if (onStatusChange) {
            onStatusChange(newStatus);
          }
        }
        return newStatus;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to check payment status";
        setError(errorMsg);
        if (onError) {
          onError(errorMsg);
        }
        throw err;
      }
    },
    [fetchPaymentStatus, onStatusChange, onError]
  );

  // Auto-start polling when paymentIntentId is provided
  useEffect(() => {
    if (paymentIntentId && !isPolling) {
      startPolling(paymentIntentId);
    }

    return () => {
      stopPolling();
    };
  }, [paymentIntentId, startPolling, stopPolling, isPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    isPolling,
    error,
    retryCount,
    startPolling,
    stopPolling,
    checkPaymentStatus,
    isProcessing: status?.status === "processing",
    isSucceeded: status?.status === "succeeded",
    isFailed: status?.status === "canceled" || !!status?.error,
    requiresAction: status?.status === "requires_action",
  };
}
