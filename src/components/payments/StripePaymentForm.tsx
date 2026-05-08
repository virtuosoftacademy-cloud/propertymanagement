"use client";

import { Button } from "@/components/ui/button";
import React, { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CreditCard, ArrowLeft, Shield } from "lucide-react";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/formatting";

interface StripePaymentFormProps {
  clientSecret: string | null;
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  onBack: () => void;
  showBackButton?: boolean;
  inline?: boolean;
  onRequestClientSecret?: () =>
    | Promise<string | null | undefined>
    | string
    | null
    | undefined;
}

export default function StripePaymentForm({
  clientSecret,
  amount,
  onSuccess,
  onError,
  onBack,
  showBackButton = true,
  inline = false,
  onRequestClientSecret,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "info" | "error";
    text: string;
  } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  useEffect(() => {
    if (stripe && elements) {
      setIsReady(true);
    }
  }, [stripe, elements]);

  useEffect(() => {
    if (!clientSecret) {
      setStatusMessage({
        type: "info",
        text: "Payment session is initializing. This usually takes just a moment.",
      });
    } else {
      // Clear the "initializing" message once we have a client secret
      setStatusMessage((prev) => {
        // Only clear info messages, keep error messages
        if (prev?.type === "info") {
          return null;
        }
        return prev;
      });
    }
  }, [clientSecret]);

  const processPayment = async () => {
    if (!stripe || !elements) {
      console.error("Stripe or Elements not loaded");
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    let secret = clientSecret;

    // If no client secret, request one
    if (!secret) {
      setStatusMessage({
        type: "info",
        text: "Payment is still being prepared. Please wait a moment.",
      });

      if (onRequestClientSecret) {
        try {
          const maybeSecret = await onRequestClientSecret();

          if (typeof maybeSecret === "string" && maybeSecret.length > 0) {
            secret = maybeSecret;
          }
        } catch (error) {
          console.error("Error requesting clientSecret:", error);
        }
      }

      if (!secret) {
        console.error("Failed to get clientSecret");
        setStatusMessage({
          type: "error",
          text: "Payment session could not be initialized. Please try again.",
        });
        setIsLoading(false);
        return;
      }
    }

    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
      console.error("CardElement not found");
      setStatusMessage({
        type: "error",
        text: "Card input is not ready. Please refresh and try again.",
      });
      onError("Card element not ready");
      setIsLoading(false);
      return;
    }

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(secret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        console.error("Payment confirmation error:", error);
        setStatusMessage({
          type: "error",
          text: error.message || "An unexpected error occurred.",
        });
        onError(error.message || "Payment failed");
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else {
        console.warn("Payment not completed. Status:", paymentIntent?.status);
        setStatusMessage({
          type: "error",
          text: `Payment status: ${paymentIntent?.status}. Please try again.`,
        });
        onError(`Payment status: ${paymentIntent?.status || "unknown"}`);
      }
    } catch (err) {
      console.error("Unexpected error during payment:", err);
      setStatusMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      });
      onError("Unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await processPayment();
  };

  const formInner = (
    <div className="space-y-6">
      {/* Payment Amount Display - Only show in non-inline mode */}
      {!inline && (
        <div className="bg-muted p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Payment Amount:</span>
            <span className="text-lg font-bold">{formatCurrency(amount)}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {statusMessage && (
        <Alert
          variant={statusMessage.type === "error" ? "destructive" : "outline"}
        >
          <AlertDescription>{statusMessage.text}</AlertDescription>
        </Alert>
      )}

      {/* Card Element */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Payment Information
          </label>
          <div className="border rounded-md p-3 bg-white">
            {isReady ? (
              <CardElement
                options={{
                  hidePostalCode: inline,
                  style: {
                    base: {
                      fontSize: "16px",
                      color: "#30313d",
                      "::placeholder": {
                        color: "#a0a4ad",
                      },
                    },
                    invalid: {
                      color: "#df1b41",
                    },
                  },
                }}
                onChange={(event) => {
                  setCardComplete(event.complete);
                  if (event.error) {
                    setStatusMessage({
                      type: "error",
                      text:
                        event.error.message ||
                        "There was a problem with the card information.",
                    });
                  } else if (event.complete) {
                    // Clear error messages when card is complete, but keep info messages
                    setStatusMessage((prev) =>
                      prev?.type === "error" ? null : prev
                    );
                  }
                }}
              />
            ) : (
              <div className="h-10 rounded-md bg-muted animate-pulse" />
            )}
          </div>
        </div>
        {!clientSecret && isReady && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p>
              Secure payment session is initializing in the background. You can
              enter card details now.
            </p>
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div
        className={`flex ${
          inline ? "justify-end" : "flex-col sm:flex-row"
        } gap-3 pt-4`}
      >
        {showBackButton && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isLoading}
            className={
              inline ? "w-auto" : "w-full sm:flex-1 order-2 sm:order-1"
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {inline ? "Cancel" : "Back to Manual Payment"}
          </Button>
        )}
        <Button
          type={inline ? "button" : "submit"}
          onClick={inline ? processPayment : undefined}
          disabled={!stripe || !cardComplete || isLoading || !clientSecret}
          className={inline ? "w-auto" : "w-full sm:flex-1 order-1 sm:order-2"}
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing Payment...
            </>
          ) : !clientSecret ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Preparing Payment...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay {formatCurrency(amount)}
            </>
          )}
        </Button>
      </div>

      {/* Security Notice */}
      {!inline && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          <p>
            Payments are processed securely by Stripe. Your card information is
            never stored on our servers.
          </p>
        </div>
      )}
    </div>
  );

  if (inline) {
    return <div className="w-full">{formInner}</div>;
  }

  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Secure Payment
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Your payment information is secure and encrypted</span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {formInner}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
