/**
 * PropertyPro - Tenant Payment Portal
 * Comprehensive tenant-facing payment interface with payment history, auto-pay enrollment, and multiple payment methods
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DollarSign,
  CreditCard,
  Calendar,
  Download,
  Settings,
  CheckCircle,
  Clock,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { PaymentStatus, PaymentMethod, IPayment } from "@/types";
import { paymentApiClient, PaymentSummary } from "@/lib/api/payment-api.client";
import { toast } from "sonner";
import {
  usePaymentListUpdates,
  usePaymentSummaryUpdates,
  useRealTimePayments,
} from "@/hooks/useRealTimePayments";
import { formatCurrency } from "@/lib/utils/formatting";

import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
  showInfoToast,
  validateAmount,
  retryWithBackoff,
  PropertyProError,
  ErrorType,
} from "@/lib/error-handling";
import { stripeClient, stripeApiClient } from "@/lib/stripe-client";
import PaymentMethodManager from "@/components/payments/PaymentMethodManager";

interface TenantPaymentPortalProps {
  tenantId: string;
  leaseId?: string;
}

// PaymentSummary interface moved to API client

interface SavedPaymentMethod {
  id: string;
  type: PaymentMethod;
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  nickname?: string;
}

export function TenantPaymentPortal({
  tenantId,
  leaseId,
}: TenantPaymentPortalProps) {
  const [payments, setPayments] = useState<IPayment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(
    null
  );
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<
    SavedPaymentMethod[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [showMakePayment, setShowMakePayment] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<IPayment | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const handlePaymentMethodsChange = useCallback((methods: PaymentMethod[]) => {
    setSavedPaymentMethods(
      methods.map((method) => ({
        id: method.id,
        type: method.type,
        last4: method.card?.last4 || method.bank_account?.last4 || "",
        expiryMonth: method.card?.exp_month,
        expiryYear: method.card?.exp_year,
        nickname: method.billing_details.name,
        isDefault: false,
      }))
    );
  }, []);

  const fetchTenantPaymentData = useCallback(async () => {
    try {
      setLoading(true);
      setSavedPaymentMethods([]);
      const [paymentsResponse, summaryResponse] = await Promise.all([
        paymentApiClient.getTenantPayments(tenantId, leaseId),
        paymentApiClient.getTenantPaymentSummary(tenantId, leaseId),
      ]);

      if (paymentsResponse.success) {
        const paymentData =
          paymentsResponse.data?.payments ?? paymentsResponse.data;
        setPayments(paymentData || []);
      }
      if (summaryResponse.success) setPaymentSummary(summaryResponse.data);

      if (!paymentsResponse.success) {
        toast.error(paymentsResponse.message || "Failed to load payments");
      }
      if (!summaryResponse.success) {
        toast.error(
          summaryResponse.message || "Failed to load payment summary"
        );
      }
    } catch (error) {
      console.error("Error fetching tenant payment data:", error);
      toast.error("Failed to load payment information");
    } finally {
      setLoading(false);
    }
  }, [tenantId, leaseId]);

  // Real-time payment updates
  const { isConnected, connectionError, reconnect } = useRealTimePayments({
    tenantId,
    leaseId,
    enabled: true,
  });

  // Auto-update payment list when real-time updates arrive
  usePaymentListUpdates(payments, setPayments, { tenantId, leaseId });

  // Auto-refresh payment summary when payments change
  usePaymentSummaryUpdates(fetchTenantPaymentData, { tenantId, leaseId });

  useEffect(() => {
    fetchTenantPaymentData();
  }, [fetchTenantPaymentData]);

  const handleToggleAutoPay = async (enabled: boolean) => {
    try {
      const response = await paymentApiClient.toggleAutoPay(
        tenantId,
        leaseId || "",
        enabled
      );

      if (response.success) {
        toast.success(`Auto-pay ${enabled ? "enabled" : "disabled"}`);
        fetchTenantPaymentData();
      } else {
        toast.error(response.message || "Failed to update auto-pay settings");
      }
    } catch (error) {
      console.error("Error updating auto-pay:", error);
      toast.error("Failed to update auto-pay settings");
    }
  };

  const handleMakePayment = async () => {
    // Validation
    const validationErrors: string[] = [];

    if (!selectedPayment) {
      validationErrors.push("Please select a payment");
    }

    if (!selectedPaymentMethod) {
      validationErrors.push("Please select a payment method");
    }

    const amountError = validateAmount(paymentAmount);
    if (amountError) {
      validationErrors.push(amountError);
    }

    if (validationErrors.length > 0) {
      showErrorToast(
        new PropertyProError(
          ErrorType.VALIDATION,
          validationErrors.join(", "),
          { code: "VALIDATION_REQUIRED_FIELD" }
        )
      );
      return;
    }

    try {
      setProcessing(true);

      // Initialize Stripe if not already done
      await stripeClient.initialize();

      // Step 1: Create payment intent
      showInfoToast("Creating payment intent...");

      const paymentIntent = await retryWithBackoff(
        async () => {
          return await stripeApiClient.createPaymentIntent({
            amount: paymentAmount,
            paymentMethodId: selectedPaymentMethod,
            metadata: {
              paymentId: selectedPayment._id.toString(),
              tenantId: tenantId,
              leaseId: leaseId || "",
              paymentType: selectedPayment.type,
            },
          });
        },
        3,
        1000
      );

      // Step 2: Confirm payment with Stripe
      showInfoToast("Processing payment...");

      const confirmedPayment = await retryWithBackoff(
        async () => {
          return await stripeClient.confirmPayment(
            paymentIntent.client_secret,
            selectedPaymentMethod
          );
        },
        2,
        2000
      );

      if (confirmedPayment.status !== "succeeded") {
        throw new PropertyProError(
          ErrorType.PAYMENT,
          "Payment was not completed successfully",
          {
            code: "PAYMENT_NOT_COMPLETED",
            details: { status: confirmedPayment.status },
          }
        );
      }

      // Step 3: Update payment record in our system
      showInfoToast("Updating payment records...");

      const updateResponse = await retryWithBackoff(
        async () => {
          const response = await fetch(
            `/api/payments/${selectedPayment._id}/process`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                paymentMethodId: selectedPaymentMethod,
                amount: paymentAmount,
                processPayment: true,
                paymentMethod: "credit_card",
                stripePaymentIntentId: confirmedPayment.id,
                notes: `Payment processed via tenant portal - Stripe: ${confirmedPayment.id}`,
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new PropertyProError(
              ErrorType.PAYMENT,
              errorData.message || "Failed to update payment record",
              { code: "PAYMENT_UPDATE_FAILED", details: errorData }
            );
          }

          return response.json();
        },
        3,
        1000
      );

      // Step 4: Update UI with successful payment
      setPayments((prev) =>
        prev.map((p) =>
          p._id === selectedPayment._id ? updateResponse.data.payment : p
        )
      );

      // Refresh payment summary
      await fetchTenantPaymentData();

      // Show success message with details
      showSuccessToast(
        `Payment of ${formatCurrency(paymentAmount)} processed successfully!`,
        {
          duration: 5000,
          action: {
            label: "View Receipt",
            onClick: () => {
              // Open receipt modal or navigate to receipt page
            },
          },
        }
      );

      // Reset form
      setShowMakePayment(false);
      setSelectedPayment(null);
      setSelectedPaymentMethod("");
      setPaymentAmount(0);
    } catch (error) {
      console.error("Payment processing error:", error);

      // Show user-friendly error message
      showErrorToast(error);

      // If payment was partially processed, show warning
      if (
        error instanceof PropertyProError &&
        error.code === "PAYMENT_UPDATE_FAILED"
      ) {
        showWarningToast(
          "Payment may have been processed but records were not updated. Please contact support if you were charged."
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleAddPaymentMethod = async (paymentMethodData: any) => {
    try {
      // Implementation for adding payment method
      const response = await fetch("/api/tenant/payment-methods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentMethodData),
      });

      if (!response.ok) {
        throw new Error("Failed to add payment method");
      }

      const result = await response.json();

      // Add to saved payment methods
      setSavedPaymentMethods((prev) => [...prev, result.data]);

      toast.success("Payment method added successfully");
      setShowAddPaymentMethod(false);
    } catch (error) {
      console.error("Error adding payment method:", error);
      toast.error("Failed to add payment method");
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    try {
      const response = await fetch(`/api/tenant/payment-methods/${methodId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete payment method");
      }

      setSavedPaymentMethods((prev) =>
        prev.filter((method) => method.id !== methodId)
      );
      toast.success("Payment method deleted");
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast.error("Failed to delete payment method");
    }
  };

  const openPaymentDialog = (payment: IPayment) => {
    setSelectedPayment(payment);
    setPaymentAmount(payment.amount);
    setShowMakePayment(true);
  };

  const getStatusIcon = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID:
      case PaymentStatus.COMPLETED:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case PaymentStatus.PENDING:
      case PaymentStatus.UPCOMING:
        return <Clock className="h-4 w-4 text-blue-500" />;
      case PaymentStatus.OVERDUE:
      case PaymentStatus.LATE:
      case PaymentStatus.SEVERELY_OVERDUE:
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID:
      case PaymentStatus.COMPLETED:
        return "bg-green-100 text-green-800";
      case PaymentStatus.PENDING:
      case PaymentStatus.UPCOMING:
        return "bg-blue-100 text-blue-800";
      case PaymentStatus.OVERDUE:
      case PaymentStatus.LATE:
      case PaymentStatus.SEVERELY_OVERDUE:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payment Center</h2>
          <p className="text-muted-foreground">
            Manage your rent payments and payment methods
          </p>
        </div>

        {/* Real-time Connection Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? "Live Updates" : "Offline"}
          </span>
          {connectionError && (
            <Button size="sm" variant="outline" onClick={reconnect}>
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* Payment Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Current Balance
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(paymentSummary?.currentBalance || 0)}
                </p>
                {paymentSummary?.currentBalance > 0 && (
                  <p className="text-xs text-red-600">Payment due</p>
                )}
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Next Payment
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(paymentSummary?.nextPaymentAmount || 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Due{" "}
                  {paymentSummary?.nextPaymentDate
                    ? formatDate(paymentSummary.nextPaymentDate)
                    : "N/A"}
                </p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Auto-Pay Status
                </p>
                <p className="text-2xl font-bold">
                  {paymentSummary?.autoPayEnabled ? "Enabled" : "Disabled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {paymentSummary?.autoPayEnabled
                    ? "Automatic payments active"
                    : "Manual payments required"}
                </p>
              </div>
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <Settings className="h-4 w-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Outstanding Payments */}
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Payments</CardTitle>
              <CardDescription>
                Payments that require your attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payments.filter(
                (p) =>
                  ![PaymentStatus.PAID, PaymentStatus.COMPLETED].includes(
                    p.status
                  )
              ).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>All payments are up to date!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payments
                    .filter(
                      (p) =>
                        ![PaymentStatus.PAID, PaymentStatus.COMPLETED].includes(
                          p.status
                        )
                    )
                    .slice(0, 5)
                    .map((payment) => (
                      <div
                        key={payment._id.toString()}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(payment.status)}
                          <div>
                            <p className="font-medium">
                              {payment.description || payment.type}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Due: {formatDate(payment.dueDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <p className="font-medium">
                              {formatCurrency(payment.amount)}
                            </p>
                            <Badge className={getStatusColor(payment.status)}>
                              {payment.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => openPaymentDialog(payment)}
                            disabled={[
                              PaymentStatus.PAID,
                              PaymentStatus.COMPLETED,
                            ].includes(payment.status)}
                          >
                            Pay Now
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Quick Payment</CardTitle>
                <CardDescription>Make a one-time payment</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setShowMakePayment(true)}
                  disabled={!paymentSummary?.currentBalance}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Make Payment
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auto-Pay Setup</CardTitle>
                <CardDescription>Enable automatic payments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="autopay"
                    checked={paymentSummary?.autoPayEnabled || false}
                    onCheckedChange={handleToggleAutoPay}
                  />
                  <Label htmlFor="autopay">
                    {paymentSummary?.autoPayEnabled ? "Disable" : "Enable"}{" "}
                    Auto-Pay
                  </Label>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>
                    Your complete payment transaction history
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment._id.toString()}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(payment.status)}
                      <div>
                        <p className="font-medium">
                          {payment.description || payment.type}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(payment.dueDate)}
                          {payment.paidDate &&
                            ` • Paid ${formatDate(payment.paidDate)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="font-medium">
                          {formatCurrency(payment.amount)}
                        </p>
                        <Badge className={getStatusColor(payment.status)}>
                          {payment.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="methods" className="space-y-4">
          <PaymentMethodManager
            customerId={tenantId} // Using tenantId as customer ID
            onPaymentMethodsChange={handlePaymentMethodsChange}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Preferences</CardTitle>
              <CardDescription>
                Configure your payment settings and notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autopay-setting">Automatic Payments</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically pay rent on the due date
                  </p>
                </div>
                <Switch
                  id="autopay-setting"
                  checked={paymentSummary?.autoPayEnabled || false}
                  onCheckedChange={handleToggleAutoPay}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-reminders">Email Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive payment reminder emails
                  </p>
                </div>
                <Switch id="email-reminders" defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sms-notifications">SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive payment notifications via SMS
                  </p>
                </div>
                <Switch id="sms-notifications" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Make Payment Dialog */}
      <Dialog open={showMakePayment} onOpenChange={setShowMakePayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Payment</DialogTitle>
            <DialogDescription>
              {selectedPayment
                ? `Pay ${formatCurrency(selectedPayment.amount)} for ${
                    selectedPayment.description || selectedPayment.type
                  }`
                : "Select a payment to process"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Payment Amount */}
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Payment Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                placeholder="Enter amount"
              />
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select
                value={selectedPaymentMethod}
                onValueChange={setSelectedPaymentMethod}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {savedPaymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.type === "card" ? (
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          <span>**** {method.last4}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>Bank Account **** {method.last4}</span>
                        </div>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Summary */}
            {selectedPayment && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span>Payment Type:</span>
                  <span className="font-medium">{selectedPayment.type}</span>
                </div>
                <div className="flex justify-between">
                  <span>Due Date:</span>
                  <span className="font-medium">
                    {selectedPayment.dueDate.toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">
                    {formatCurrency(paymentAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* Processing Fee Notice */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                A processing fee of $2.95 will be added for credit card
                payments. Bank transfers are free.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMakePayment(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMakePayment}
              disabled={processing || !selectedPaymentMethod || !paymentAmount}
            >
              {processing ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Process Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
