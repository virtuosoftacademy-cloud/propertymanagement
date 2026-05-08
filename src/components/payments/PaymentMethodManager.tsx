"use client";

import { useState, useEffect } from "react";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CreditCard,
  Building2,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
  showInfoToast,
  validateRequired,
  validateEmail,
  retryWithBackoff,
  PropertyProError,
  ErrorType,
} from "@/lib/error-handling";
import {
  stripeClient,
  stripeApiClient,
  PaymentMethod,
} from "@/lib/stripe-client";

// Initialize Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface PaymentMethodManagerProps {
  customerId: string;
  onPaymentMethodsChange?: (methods: PaymentMethod[]) => void;
}

export default function PaymentMethodManager({
  customerId,
  onPaymentMethodsChange,
}: PaymentMethodManagerProps) {
  return (
    <Elements stripe={stripePromise}>
      <PaymentMethodManagerContent
        customerId={customerId}
        onPaymentMethodsChange={onPaymentMethodsChange}
      />
    </Elements>
  );
}

function PaymentMethodManagerContent({
  customerId,
  onPaymentMethodsChange,
}: PaymentMethodManagerProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeCustomerId, setActiveCustomerId] = useState(customerId);

  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    setActiveCustomerId(customerId);
  }, [customerId]);

  useEffect(() => {
    fetchPaymentMethods(customerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (onPaymentMethodsChange) {
      onPaymentMethodsChange(paymentMethods);
    }
  }, [paymentMethods, onPaymentMethodsChange]);

  const fetchPaymentMethods = async (identifier?: string) => {
    const targetCustomerId = identifier ?? activeCustomerId ?? customerId;

    if (!targetCustomerId) {
      return;
    }

    try {
      setLoading(true);

      const { methods, customerId: resolvedCustomerId } =
        await retryWithBackoff(
          async () => {
            return await stripeApiClient.getCustomerPaymentMethods(
              targetCustomerId
            );
          },
        3,
        1000
      );

      setActiveCustomerId(resolvedCustomerId);
      setPaymentMethods(methods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      showErrorToast(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymentMethod = async (billingDetails: {
    name: string;
    email: string;
    address: {
      line1: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  }) => {
    if (!stripe || !elements) {
      showErrorToast(
        new PropertyProError(ErrorType.PAYMENT, "Payment system not ready", {
          code: "STRIPE_NOT_READY",
        })
      );
      return;
    }

    try {
      setProcessing(true);
      showInfoToast("Creating payment method...");

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new PropertyProError(
          ErrorType.PAYMENT,
          "Card element not found",
          { code: "CARD_ELEMENT_NOT_FOUND" }
        );
      }

      // Create payment method
      const paymentMethod = await stripeClient.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: billingDetails,
      });

      // Attach to customer
      const customerForAttachment = activeCustomerId;

      if (!customerForAttachment || !customerForAttachment.startsWith("cus_")) {
        throw new PropertyProError(
          ErrorType.PAYMENT,
          "Unable to determine Stripe customer",
          { code: "STRIPE_CUSTOMER_MISSING" }
        );
      }

      await stripeApiClient.attachPaymentMethod(
        paymentMethod.id,
        customerForAttachment
      );

      // Refresh payment methods
      await fetchPaymentMethods(customerForAttachment);

      showSuccessToast("Payment method added successfully");
      setShowAddDialog(false);
    } catch (error) {
      console.error("Error adding payment method:", error);
      showErrorToast(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    try {
      showInfoToast("Removing payment method...");

      await retryWithBackoff(
        async () => {
          await stripeApiClient.detachPaymentMethod(paymentMethodId);
        },
        3,
        1000
      );

      // Remove from local state
      setPaymentMethods((prev) =>
        prev.filter((pm) => pm.id !== paymentMethodId)
      );

      showSuccessToast("Payment method removed successfully");
    } catch (error) {
      console.error("Error deleting payment method:", error);
      showErrorToast(error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Loading payment methods...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>
                Manage your saved payment methods
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Method
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No payment methods</h3>
              <p className="text-muted-foreground mb-4">
                Add a payment method to start making payments
              </p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Payment Method
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {method.type === "card" ? (
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="font-medium">
                        {method.type === "card" && method.card ? (
                          <>
                            {method.card.brand.toUpperCase()} ••••{" "}
                            {method.card.last4}
                            <Badge variant="outline" className="ml-2">
                              {method.card.exp_month}/{method.card.exp_year}
                            </Badge>
                          </>
                        ) : (
                          `${method.type} •••• ${method.bank_account?.last4}`
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {method.billing_details.name}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeletePaymentMethod(method.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddPaymentMethodDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddPaymentMethod}
        processing={processing}
      />
    </>
  );
}

interface AddPaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (billingDetails: any) => void;
  processing: boolean;
}

function AddPaymentMethodDialog({
  open,
  onOpenChange,
  onAdd,
  processing,
}: AddPaymentMethodDialogProps) {
  const [billingDetails, setBillingDetails] = useState({
    name: "",
    email: "",
    address: {
      line1: "",
      city: "",
      state: "",
      postal_code: "",
      country: "US",
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const validationErrors: string[] = [];

    if (!billingDetails.name.trim()) {
      validationErrors.push("Name is required");
    }

    if (!billingDetails.email.trim()) {
      validationErrors.push("Email is required");
    } else {
      const emailError = validateEmail(billingDetails.email);
      if (emailError) validationErrors.push(emailError);
    }

    if (!billingDetails.address.line1.trim()) {
      validationErrors.push("Address is required");
    }

    if (!billingDetails.address.city.trim()) {
      validationErrors.push("City is required");
    }

    if (!billingDetails.address.state.trim()) {
      validationErrors.push("State is required");
    }

    if (!billingDetails.address.postal_code.trim()) {
      validationErrors.push("Postal code is required");
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

    onAdd(billingDetails);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>
            Add a new credit or debit card for payments
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Card Element */}
          <div className="space-y-2">
            <Label>Card Information</Label>
            <div className="p-3 border rounded-md">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: "16px",
                      color: "#424770",
                      "::placeholder": {
                        color: "#aab7c4",
                      },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Billing Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={billingDetails.name}
                onChange={(e) =>
                  setBillingDetails((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={billingDetails.email}
                onChange={(e) =>
                  setBillingDetails((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={billingDetails.address.line1}
              onChange={(e) =>
                setBillingDetails((prev) => ({
                  ...prev,
                  address: { ...prev.address, line1: e.target.value },
                }))
              }
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={billingDetails.address.city}
                onChange={(e) =>
                  setBillingDetails((prev) => ({
                    ...prev,
                    address: { ...prev.address, city: e.target.value },
                  }))
                }
                placeholder="New York"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={billingDetails.address.state}
                onChange={(e) =>
                  setBillingDetails((prev) => ({
                    ...prev,
                    address: { ...prev.address, state: e.target.value },
                  }))
                }
                placeholder="NY"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal">ZIP</Label>
              <Input
                id="postal"
                value={billingDetails.address.postal_code}
                onChange={(e) =>
                  setBillingDetails((prev) => ({
                    ...prev,
                    address: { ...prev.address, postal_code: e.target.value },
                  }))
                }
                placeholder="10001"
              />
            </div>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your payment information is securely processed by Stripe and never
              stored on our servers.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={processing}>
              {processing ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payment Method
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
