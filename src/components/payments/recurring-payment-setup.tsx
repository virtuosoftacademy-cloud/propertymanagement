"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CreditCard,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Settings,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

// ============================================================================
// INTERFACES
// ============================================================================

interface RecurringPaymentSetup {
  _id?: string;
  tenantId: string;
  propertyId: string;
  leaseId: string;
  amount: number;
  frequency: "monthly" | "weekly" | "bi-weekly";
  dayOfMonth: number; // For monthly payments
  dayOfWeek: number; // For weekly payments
  isActive: boolean;
  stripeSubscriptionId?: string;
  nextPaymentDate: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TenantLease {
  _id: string;
  propertyId: {
    _id: string;
    name: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
  };
  terms: {
    rentAmount: number;
    securityDeposit: number;
    lateFee: number;
  };
  startDate: string;
  endDate: string;
  status: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
import { formatCurrency } from "@/lib/utils/formatting";

interface RecurringPaymentSetupProps {
  onSetupComplete?: () => void;
  onSetupError?: (error: string) => void;
}

export function RecurringPaymentSetup({
  onSetupComplete,
  onSetupError,
}: RecurringPaymentSetupProps) {
  const { data: session } = useSession();

  // State management
  const [currentLease, setCurrentLease] = useState<TenantLease | null>(null);
  const [existingSetup, setExistingSetup] =
    useState<RecurringPaymentSetup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [frequency, setFrequency] = useState<
    "monthly" | "weekly" | "bi-weekly"
  >("monthly");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [useCustomAmount, setUseCustomAmount] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch tenant data and existing setup
  useEffect(() => {
    if (session?.user) {
      fetchTenantData();
    }
  }, [session]);

  const fetchTenantData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch current lease
      const dashboardResponse = await fetch("/api/tenant/dashboard");
      if (!dashboardResponse.ok) {
        throw new Error("Failed to fetch tenant dashboard data");
      }
      const dashboardData = await dashboardResponse.json();
      const lease = dashboardData.data?.currentLease;

      if (!lease) {
        throw new Error("No active lease found");
      }

      setCurrentLease(lease);

      // Fetch existing recurring payment setup
      const setupResponse = await fetch("/api/tenant/recurring-payments");
      if (setupResponse.ok) {
        const setupData = await setupResponse.json();
        if (setupData.data) {
          setExistingSetup(setupData.data);
          setFrequency(setupData.data.frequency);
          setDayOfMonth(setupData.data.dayOfMonth || 1);
          setDayOfWeek(setupData.data.dayOfWeek || 1);
          setIsActive(setupData.data.isActive);
          if (setupData.data.amount !== lease.terms.rentAmount) {
            setUseCustomAmount(true);
            setCustomAmount(setupData.data.amount);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching tenant data:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load tenant data";
      setError(errorMessage);
      onSetupError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSetup = async () => {
    if (!currentLease) {
      toast.error("No active lease found");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const amount =
        useCustomAmount && customAmount
          ? customAmount
          : currentLease.terms.rentAmount;

      const setupData: Partial<RecurringPaymentSetup> = {
        tenantId: session?.user?.id,
        propertyId: currentLease.propertyId._id,
        leaseId: currentLease._id,
        amount,
        frequency,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
        dayOfWeek: frequency !== "monthly" ? dayOfWeek : undefined,
        isActive,
      };

      const method = existingSetup ? "PUT" : "POST";
      const url = existingSetup
        ? `/api/tenant/recurring-payments/${existingSetup._id}`
        : "/api/tenant/recurring-payments";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(setupData),
      });

      const result = await response.json();

      if (response.ok) {
        setExistingSetup(result.data);
        toast.success(
          existingSetup
            ? "Recurring payment updated successfully"
            : "Recurring payment setup completed successfully"
        );
        onSetupComplete?.();
      } else {
        throw new Error(
          result.error || "Failed to save recurring payment setup"
        );
      }
    } catch (error) {
      console.error("Error saving recurring payment setup:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save setup";
      setError(errorMessage);
      onSetupError?.(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelSetup = async () => {
    if (!existingSetup) return;

    try {
      setIsCancelling(true);

      const response = await fetch(
        `/api/tenant/recurring-payments/${existingSetup._id}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setExistingSetup(null);
        setIsActive(false);
        toast.success("Recurring payment cancelled successfully");
        onSetupComplete?.();
      } else {
        const result = await response.json();
        throw new Error(result.error || "Failed to cancel recurring payment");
      }
    } catch (error) {
      console.error("Error cancelling recurring payment:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to cancel setup";
      toast.error(errorMessage);
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
    }
  };

  // const formatCurrency = (amount: number) => {
  //   return new Intl.NumberFormat("en-US", {
  //     style: "currency",
  //     currency: "USD",
  //   }).format(amount);
  // };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getNextPaymentDate = () => {
    const now = new Date();
    let nextDate = new Date();

    switch (frequency) {
      case "monthly":
        nextDate.setDate(dayOfMonth);
        if (nextDate <= now) {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        break;
      case "weekly":
        const daysUntilNext = (dayOfWeek - now.getDay() + 7) % 7;
        nextDate.setDate(now.getDate() + (daysUntilNext || 7));
        break;
      case "bi-weekly":
        const daysUntilNextBiWeekly = (dayOfWeek - now.getDay() + 7) % 7;
        nextDate.setDate(now.getDate() + (daysUntilNextBiWeekly || 14));
        break;
    }

    return nextDate.toISOString();
  };

  const getDayOfWeekName = (day: number) => {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return days[day];
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="text-muted-foreground">
              Loading recurring payment setup...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!currentLease) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No active lease found. You need an active lease to set up
              recurring payments.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Setup Status */}
      {existingSetup && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Current Recurring Payment Setup
            </CardTitle>
            <CardDescription>
              Your automatic payment is currently{" "}
              {existingSetup.isActive ? "active" : "inactive"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Payment Amount</Label>
                <p className="text-lg font-semibold">
                  {formatCurrency(existingSetup.amount)}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Frequency</Label>
                <p className="capitalize">
                  {existingSetup.frequency.replace("-", " ")}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Next Payment</Label>
                <p>{formatDate(existingSetup.nextPaymentDate)}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <Badge
                  variant={existingSetup.isActive ? "default" : "secondary"}
                >
                  {existingSetup.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {existingSetup ? "Update" : "Setup"} Recurring Payment
          </CardTitle>
          <CardDescription>
            Configure automatic rent payments for {currentLease.propertyId.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Property Information */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2">Property Details</h4>
            <p className="font-medium">{currentLease.propertyId.name}</p>
            <p className="text-sm text-muted-foreground">
              {currentLease.propertyId.address.street},{" "}
              {currentLease.propertyId.address.city},{" "}
              {currentLease.propertyId.address.state}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Monthly Rent: {formatCurrency(currentLease.terms.rentAmount)}
            </p>
          </div>

          {/* Payment Amount */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="custom-amount"
                checked={useCustomAmount}
                onCheckedChange={setUseCustomAmount}
              />
              <Label htmlFor="custom-amount">Use custom payment amount</Label>
            </div>

            {useCustomAmount ? (
              <div className="space-y-2">
                <Label htmlFor="amount">Custom Payment Amount</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={customAmount || ""}
                    onChange={(e) =>
                      setCustomAmount(parseFloat(e.target.value) || null)
                    }
                    className="pl-10"
                    placeholder="Enter amount"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Payment Amount</Label>
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="font-semibold">
                    {formatCurrency(currentLease.terms.rentAmount)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Monthly rent amount
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Payment Frequency */}
          <div className="space-y-2">
            <Label>Payment Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(value: any) => setFrequency(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payment Day Selection */}
          {frequency === "monthly" ? (
            <div className="space-y-2">
              <Label>Day of Month</Label>
              <Select
                value={dayOfMonth.toString()}
                onValueChange={(value) => setDayOfMonth(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Payments will be processed on the {dayOfMonth}
                {dayOfMonth === 1
                  ? "st"
                  : dayOfMonth === 2
                  ? "nd"
                  : dayOfMonth === 3
                  ? "rd"
                  : "th"}{" "}
                of each month
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select
                value={dayOfWeek.toString()}
                onValueChange={(value) => setDayOfWeek(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      {getDayOfWeekName(i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Payments will be processed every{" "}
                {frequency === "weekly" ? "" : "other "}
                {getDayOfWeekName(dayOfWeek)}
              </p>
            </div>
          )}

          {/* Next Payment Preview */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                Next Payment Preview
              </h4>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Amount:{" "}
              {formatCurrency(
                useCustomAmount && customAmount
                  ? customAmount
                  : currentLease.terms.rentAmount
              )}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Next payment date: {formatDate(getNextPaymentDate())}
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="active">Enable automatic payments</Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSaveSetup}
              disabled={isSaving || (useCustomAmount && !customAmount)}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {existingSetup ? "Update Setup" : "Setup Recurring Payment"}
                </>
              )}
            </Button>

            {existingSetup && (
              <Button
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Cancel Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Recurring Payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently cancel your automatic rent payment setup.
              You will need to make manual payments or set up recurring payments
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Setup</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSetup}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? "Cancelling..." : "Cancel Setup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
