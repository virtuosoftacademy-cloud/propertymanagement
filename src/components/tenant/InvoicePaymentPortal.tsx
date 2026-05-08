/**
 * PropertyPro - Tenant Invoice Payment Portal
 * Self-service payment interface for tenants to pay invoices online
 */

"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripePaymentForm from "@/components/payments/StripePaymentForm";

// Initialize Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);
import { formatCurrency } from "@/lib/utils/formatting";

interface Invoice {
  _id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  daysOverdue?: number;
  propertyId?: {
    name: string;
    address: string;
  } | null;
  items: Array<{
    description: string;
    amount: number;
    type: string;
  }>;
}

interface InvoicePaymentPortalProps {
  invoiceId?: string;
  showAllInvoices?: boolean;
}

export default function InvoicePaymentPortal({
  invoiceId,
  showAllInvoices = false,
}: InvoicePaymentPortalProps) {
  const { data: session } = useSession();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentMode, setPaymentMode] = useState<"select" | "payment">(
    "select"
  );
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(
    null
  );

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  const getStatusBadge = (status: string, daysOverdue?: number) => {
    const statusConfig = {
      scheduled: {
        variant: "secondary" as const,
        label: "Scheduled",
        icon: Calendar,
      },
      issued: { variant: "outline" as const, label: "Issued", icon: FileText },
      paid: { variant: "default" as const, label: "Paid", icon: CheckCircle },
      partial: { variant: "secondary" as const, label: "Partial", icon: Clock },
      overdue: {
        variant: "destructive" as const,
        label: `Overdue${daysOverdue ? ` (${daysOverdue}d)` : ""}`,
        icon: AlertTriangle,
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      variant: "outline" as const,
      label: status,
      icon: FileText,
    };

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <config.icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  useEffect(() => {
    fetchInvoices();
  }, [invoiceId, showAllInvoices]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      let url = "/api/tenant/invoices";

      if (invoiceId) {
        url = `/api/invoices/${invoiceId}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.data) {
        if (invoiceId) {
          setInvoices([data.data]);
          setSelectedInvoice(data.data);
        } else {
          setInvoices(data.data.invoices || []);
        }
      } else {
        toast.error("Failed to fetch invoices");
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to fetch invoices");
    } finally {
      setLoading(false);
    }
  };

  const initializePayment = async (invoice: Invoice) => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/invoices/${invoice._id}/stripe-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: invoice.balanceRemaining }),
        }
      );

      const result = await response.json();
      const paymentIntent = result?.data?.paymentIntent;
      if (result.success && paymentIntent?.clientSecret) {
        setStripeClientSecret(paymentIntent.clientSecret);
        setSelectedInvoice(invoice);
        setPaymentMode("payment");
        toast.success("Payment initialized. Please complete payment below.");
      } else {
        toast.error(result.error || "Failed to initialize payment");
      }
    } catch (error) {
      console.error("Error initializing payment:", error);
      toast.error("Failed to initialize payment");
    } finally {
      setLoading(false);
    }
  };

  const requestClientSecret = async () => {
    if (!selectedInvoice) {
      return null;
    }

    try {
      const response = await fetch(
        `/api/invoices/${selectedInvoice._id}/stripe-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: selectedInvoice.balanceRemaining }),
        }
      );

      const result = await response.json();
      const paymentIntent = result?.data?.paymentIntent;
      if (result.success && paymentIntent?.clientSecret) {
        const secret = paymentIntent.clientSecret as string;
        setStripeClientSecret(secret);
        return secret;
      }

      toast.error(result.error || "Failed to prepare payment session");
      return null;
    } catch (error) {
      console.error("Error refreshing payment session:", error);
      toast.error("Failed to prepare payment session");
      return null;
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    try {
      setLoading(true);
      const response = await fetch("/api/stripe/payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId, forceRefresh: true }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to finalize payment");
      }

      toast.success("Payment completed successfully!");
    } catch (error) {
      console.error("Error finalizing Stripe payment:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Payment was processed but we couldn't update the invoice automatically."
      );
    } finally {
      setPaymentMode("select");
      setStripeClientSecret(null);
      setSelectedInvoice(null);
      await fetchInvoices();
      setLoading(false);
    }
  };

  const handlePaymentError = (error: string) => {
    toast.error(`Payment failed: ${error}`);
  };

  const handleBackToSelection = () => {
    setPaymentMode("select");
    setStripeClientSecret(null);
    setSelectedInvoice(null);
  };

  if (loading && invoices.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (paymentMode === "payment" && selectedInvoice && stripeClientSecret) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Complete Payment</h2>
          <Button variant="outline" onClick={handleBackToSelection}>
            Back to Invoices
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invoice {selectedInvoice.invoiceNumber}</CardTitle>
            <p className="text-muted-foreground">
              {selectedInvoice.propertyId?.name || "N/A"}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(selectedInvoice.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount Due</p>
                <p className="text-lg font-semibold text-red-600">
                  {formatCurrency(selectedInvoice.balanceRemaining)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Elements stripe={stripePromise}>
          <StripePaymentForm
            clientSecret={stripeClientSecret}
            amount={selectedInvoice.balanceRemaining}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            onBack={handleBackToSelection}
            onRequestClientSecret={requestClientSecret}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {showAllInvoices ? "My Invoices" : "Invoice Payment"}
        </h2>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Invoices Found</h3>
            <p className="text-muted-foreground">
              You don't have any outstanding invoices at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <Card key={invoice._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Invoice {invoice.invoiceNumber}
                  </CardTitle>
                  {getStatusBadge(invoice.status, invoice.daysOverdue)}
                </div>
                <p className="text-muted-foreground">
                  {invoice.propertyId?.name || "N/A"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Issue Date</p>
                    <p className="font-medium">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-medium">
                      {new Date(invoice.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Amount
                    </p>
                    <p className="font-medium">
                      {formatCurrency(invoice.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Amount Due</p>
                    <p className="font-medium text-red-600">
                      {formatCurrency(invoice.balanceRemaining)}
                    </p>
                  </div>
                </div>

                {invoice.balanceRemaining > 0 && invoice.status !== "paid" && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => initializePayment(invoice)}
                      disabled={loading}
                      className="flex-1"
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Pay {formatCurrency(invoice.balanceRemaining)}
                    </Button>
                    <Button variant="outline" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {invoice.status === "paid" && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      This invoice has been paid in full.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
