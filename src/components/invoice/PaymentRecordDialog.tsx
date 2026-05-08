"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripePaymentForm from "@/components/payments/StripePaymentForm";

// Initialize Stripe once on the client
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const paymentSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: z.enum([
    "cash",
    "check",
    "bank_transfer",
    "credit_card",
    "debit_card",
    "online",
    "manual",
  ]),
  paidDate: z.string().min(1, "Payment date is required"),
  transactionId: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentForm = z.infer<typeof paymentSchema>;

interface PaymentRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    _id: string;
    invoiceNumber: string;
    totalAmount: number;
    amountPaid: number;
    balanceRemaining: number;
    tenantId: {
      firstName: string;
      lastName: string;
    };
  } | null;
  onPaymentRecorded: () => void;
}

const stripeAppearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0570de",
    colorBackground: "#ffffff",
    colorText: "#30313d",
    colorDanger: "#df1b41",
    fontFamily: "system-ui, sans-serif",
    spacingUnit: "4px",
    borderRadius: "6px",
  },
};
import { formatCurrency } from "@/lib/utils/formatting";

export default function PaymentRecordDialog({
  open,
  onOpenChange,
  invoice,
  onPaymentRecorded,
}: PaymentRecordDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [stripeInitializing, setStripeInitializing] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(
    null
  );
  const [showStripeElements, setShowStripeElements] = useState(true);
  const stripeIntentAmountRef = React.useRef<number | null>(null);
  const [stripeInitError, setStripeInitError] = useState<string | null>(null);

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: invoice?.balanceRemaining || 0,
      paymentMethod: "credit_card",
      paidDate: format(new Date(), "yyyy-MM-dd"),
      transactionId: "",
      notes: "",
    },
  });

  // Keep manual amount in sync when invoice changes
  React.useEffect(() => {
    if (invoice) {
      form.setValue("amount", invoice.balanceRemaining);
    }
  }, [invoice, form]);

  // Debug: Log clientSecret changes
  React.useEffect(() => {}, [
    stripeClientSecret,
    stripeInitializing,
    stripeInitError,
  ]);

  // Reset Stripe-related state whenever the dialog closes
  React.useEffect(() => {
    if (!open) {
      setShowStripeElements(true);
      setStripeClientSecret(null);
      stripeIntentAmountRef.current = null;
      form.setValue("paymentMethod", "credit_card");
      setStripeInitError(null);
    }
  }, [open, form]);

  const paymentMethod = form.watch("paymentMethod");
  const watchedAmount = form.watch("amount");

  const initializeStripePayment = React.useCallback(
    async (
      amount: number,
      { silent = false }: { silent?: boolean } = {}
    ): Promise<string | null> => {
      if (!invoice || amount <= 0) {
        console.warn("Cannot initialize payment:", {
          hasInvoice: !!invoice,
          amount,
        });
        return null;
      }

      try {
        if (!silent) {
          setSubmitting(true);
        }
        setStripeInitializing(true);
        setStripeInitError(null);

        const response = await fetch(
          `/api/invoices/${invoice._id}/stripe-payment`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          }
        );

        const result = await response.json();

        if (result.success) {
          const secret = result.data.paymentIntent.clientSecret as string;

          if (!secret) {
            console.error("❌ No clientSecret in response!");
            setStripeInitError("Payment session could not be created");
            toast.error("Payment session could not be created");
            return null;
          }

          setStripeClientSecret(secret);
          stripeIntentAmountRef.current = amount;
          setStripeInitError(null);

          return secret;
        } else {
          const message = result.error || "Failed to initialize payment";
          console.error("❌ Failed to initialize payment:", message);
          setStripeClientSecret(null);
          setStripeInitError(message);
          toast.error(message);
          return null;
        }
      } catch (error) {
        console.error("❌ Error initializing Stripe payment:", error);
        setStripeClientSecret(null);
        setStripeInitError(
          "Failed to initialize payment session. Please try again."
        );
        toast.error("Failed to initialize payment");
        return null;
      } finally {
        if (!silent) {
          setSubmitting(false);
        }
        setStripeInitializing(false);
      }
    },
    [invoice]
  );

  // Initialize Stripe payment when needed
  React.useEffect(() => {
    // Determine if we should show Stripe elements
    const shouldShowStripe =
      paymentMethod === "credit_card" || paymentMethod === "online";
    setShowStripeElements(shouldShowStripe);

    // Only initialize if dialog is open, invoice exists, and Stripe method selected
    if (!open || !invoice || !shouldShowStripe) {
      if (!shouldShowStripe) {
        setStripeInitError(null);
      }
      return;
    }

    const amountToUse =
      watchedAmount && watchedAmount > 0
        ? watchedAmount
        : invoice.balanceRemaining;

    // Initialize payment if conditions are met
    if (
      amountToUse > 0 &&
      stripeIntentAmountRef.current !== amountToUse &&
      !stripeInitializing &&
      !stripeInitError
    ) {
      void initializeStripePayment(amountToUse, { silent: false });
    }
  }, [
    open,
    paymentMethod,
    invoice,
    watchedAmount,
    initializeStripePayment,
    stripeInitializing,
    stripeInitError,
  ]);

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  const onSubmit = async (data: PaymentForm) => {
    if (!invoice) return;

    try {
      setSubmitting(true);

      const response = await fetch(`/api/invoices/${invoice._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "add_payment",
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          paidDate: new Date(data.paidDate).toISOString(),
          transactionId: data.transactionId,
          notes: data.notes,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Payment recorded successfully");
        onPaymentRecorded();
        onOpenChange(false);
        form.reset({
          amount: invoice.balanceRemaining,
          paymentMethod: "credit_card",
          paidDate: format(new Date(), "yyyy-MM-dd"),
          transactionId: "",
          notes: "",
        });
        setStripeInitError(null);
      } else {
        toast.error(result.error || "Failed to record payment");
      }
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error("Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFullPayment = () => {
    if (invoice) {
      form.setValue("amount", invoice.balanceRemaining);
    }
  };

  const handleStripePaymentSuccess = async (paymentIntentId: string) => {
    try {
      setSubmitting(true);

      const statusResponse = await fetch(`/api/stripe/payment-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId,
          forceRefresh: true,
        }),
      });

      const statusResult = await statusResponse.json();

      if (statusResult.success) {
        // Check for sync errors
        const syncErrors = statusResult.data?.sync?.invoiceSyncErrors || [];
        if (syncErrors.length > 0) {
          console.warn("Payment recorded with sync errors:", syncErrors);
          toast.warning(
            "Payment completed but invoice sync had issues. Please refresh to see updated balance."
          );
        } else {
          toast.success("Payment completed and invoice updated successfully!");
        }

        onPaymentRecorded();
        onOpenChange(false);
        setShowStripeElements(false);
        setStripeClientSecret(null);
        stripeIntentAmountRef.current = null;
        setStripeInitError(null);
        form.reset({
          amount: invoice ? invoice.balanceRemaining : 0,
          paymentMethod: "credit_card",
          paidDate: format(new Date(), "yyyy-MM-dd"),
          transactionId: "",
          notes: "",
        });
      } else {
        console.error("Payment status check failed:", statusResult);
        toast.error(
          statusResult.error || "Payment completed but failed to update records"
        );
      }
    } catch (error) {
      console.error("Error handling payment success:", error);
      toast.error(
        "Payment completed but there was an error processing the payment"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripePaymentError = (error: string) => {
    toast.error(`Payment failed: ${error}`);
  };

  const handleRetryStripeInit = async () => {
    if (!invoice) {
      return null;
    }

    const amountToUse =
      watchedAmount && watchedAmount > 0
        ? watchedAmount
        : invoice.balanceRemaining;

    stripeIntentAmountRef.current = null;
    setStripeInitError(null);
    return initializeStripePayment(amountToUse, { silent: false });
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Record a payment for invoice {invoice.invoiceNumber} from{" "}
            {invoice.tenantId.firstName} {invoice.tenantId.lastName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Total Amount</p>
                <p className="font-semibold">
                  {formatCurrency(invoice.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Amount Paid</p>
                <p className="font-semibold text-green-600">
                  {formatCurrency(invoice.amountPaid)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-600">Balance Remaining</p>
                <p className="text-lg font-bold text-red-600">
                  {formatCurrency(invoice.balanceRemaining)}
                </p>
              </div>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={invoice.balanceRemaining}
                            placeholder="0.00"
                            className="pl-9"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFullPayment}
                    className="h-10"
                  >
                    Full Payment
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="bank_transfer">
                            Bank Transfer
                          </SelectItem>
                          <SelectItem value="credit_card">
                            Credit Card
                          </SelectItem>
                          <SelectItem value="debit_card">Debit Card</SelectItem>
                          <SelectItem value="online">Online Payment</SelectItem>
                          <SelectItem value="manual">Manual Entry</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paidDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {showStripeElements && (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Card Payment Details
                    </h4>
                    <Elements
                      stripe={stripePromise}
                      options={{
                        appearance: stripeAppearance,
                        clientSecret: stripeClientSecret || undefined,
                      }}
                      key={stripeClientSecret || "no-secret"}
                    >
                      <StripePaymentForm
                        clientSecret={stripeClientSecret}
                        amount={form.getValues("amount")}
                        onSuccess={handleStripePaymentSuccess}
                        onError={handleStripePaymentError}
                        onBack={() => {
                          form.setValue("paymentMethod", "manual");
                          setShowStripeElements(false);
                        }}
                        showBackButton={true}
                        inline
                        onRequestClientSecret={handleRetryStripeInit}
                      />
                    </Elements>
                    {stripeInitError && (
                      <div className="mt-3 space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        <p>{stripeInitError}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={handleRetryStripeInit}
                          disabled={stripeInitializing || submitting}
                        >
                          {stripeInitializing
                            ? "Retrying..."
                            : "Retry payment setup"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!showStripeElements && (
                <FormField
                  control={form.control}
                  name="transactionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transaction ID (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter transaction ID or reference"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any notes about this payment..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  className="w-full sm:w-auto order-2 sm:order-1"
                >
                  Cancel
                </Button>
                {!showStripeElements && (
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto order-1 sm:order-2"
                    size="lg"
                  >
                    {submitting ? "Processing..." : "Record Payment"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
