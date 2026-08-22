"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  CreditCard,
  Banknote,
  PoundSterling,
  FileText,
  Send,
} from "lucide-react";
import { PaymentStatus, PaymentMethod, IPayment, ILease, UserRole } from "@/types";
import { useSession } from "next-auth/react";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { LeaseResponse } from "@/lib/services/lease.service";
import { findLeaseUnitNumber } from "@/lib/leases/lease-number";
import { toast } from "sonner";
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
  showInfoToast,
  retryWithBackoff,
  PropertyProError,
  ErrorType,
} from "@/lib/error-handling";
import {
  usePaymentListUpdates,
  useRealTimePayments,
} from "@/hooks/useRealTimePayments";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface PaymentStatusDashboardProps {
  leaseId: string;
  lease: LeaseResponse;
  onPaymentUpdate?: (payment: IPayment) => void;
  onInvoiceGenerated?: (invoiceId: string) => void;
}

interface PaymentSummary {
  totalDue: number;
  totalPaid: number;
  totalOverdue: number;
  totalUpcoming: number;
  paymentProgress: number;
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
}

export function PaymentStatusDashboard({
  leaseId,
  lease,
  onPaymentUpdate,
  onInvoiceGenerated,
}: PaymentStatusDashboardProps) {
  const { t, formatCurrency, formatDate, formatNumber } =
    useLocalizationContext();

  const [payments, setPayments] = useState<IPayment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({
    totalDue: 0,
    totalPaid: 0,
    totalOverdue: 0,
    totalUpcoming: 0,
    paymentProgress: 0,
    nextPaymentDate: null,
    nextPaymentAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time payment updates
  const { isConnected, connectionError, reconnect } = useRealTimePayments({
    leaseId,
    enabled: true,
  });

  // Auto-update payment list when real-time updates arrive
  usePaymentListUpdates(payments, setPayments, { leaseId });

  const { data: session } = useSession();
  const isTenant = session?.user?.role === UserRole.TENANT;

  // Both the stat cards and the list below are driven by INVOICES — what was
  // actually billed — rather than by payment rows.
  const [invoices, setInvoices] = useState<any[]>([]);

  // Counts by invoice status, mirroring the invoices page's stat cards.
  // "Overdue" is derived rather than read from status: an issued invoice past
  // its due date is overdue whether or not a job has restamped it.
  const invoiceStats = React.useMemo(() => {
    const now = new Date();
    const count = (fn: (i: any) => boolean) => invoices.filter(fn).length;

    return {
      total: invoices.length,
      paid: count(
        (i) => (i.balanceRemaining ?? 0) <= 0 && i.status !== "cancelled"
      ),
      issued: count((i) => i.status === "issued" || i.status === "sent"),
      overdue: count(
        (i) =>
          (i.balanceRemaining ?? 0) > 0 &&
          i.dueDate &&
          new Date(i.dueDate) < now
      ),
      partial: count(
        (i) => (i.amountPaid ?? 0) > 0 && (i.balanceRemaining ?? 0) > 0
      ),
      totalAmount: invoices.reduce((sum, i) => sum + (i.totalAmount ?? 0), 0),
    };
  }, [invoices]);

  // Scope to the unit this lease covers, so a multi-unit property does not show
  // every unit's invoices here. Only used when the reference actually resolves
  // to a unit on the property — a dangling unitId would match nothing and empty
  // the list, so those leases fall back to the lease itself (the same set for a
  // single-unit tenancy). See scripts/fix-orphaned-unit-ids.js for why some
  // existing leases have no resolvable unit.
  const unitId = React.useMemo(() => {
    if (!findLeaseUnitNumber(lease)) return null;
    const raw: any = (lease as any)?.unitId;
    return raw?._id?.toString?.() ?? raw?.toString?.() ?? null;
  }, [lease]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const scope = unitId ? `unitId=${unitId}` : `leaseId=${leaseId}`;
        // includePaid: the cards total what was billed and collected, so a
        // settled invoice has to be in the response — without it Total Paid
        // silently drops every invoice that has been paid off.
        const res = await fetch(
          `/api/invoices?${scope}&limit=50&includePaid=true`
        );
        const json = await res.json();
        if (cancelled) return;
        // /api/invoices nests the array under data.invoices (data itself is
        // {invoices, pagination}), not a bare array — this used to check
        // Array.isArray(json?.data), which was never true, so this dashboard
        // always summarised an empty list regardless of real invoices.
        const list =
          res.ok && Array.isArray(json?.data?.invoices)
            ? json.data.invoices
            : [];
        setInvoices(list);
        calculateSummary(list);
      } catch {
        if (!cancelled) {
          setInvoices([]);
          calculateSummary([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leaseId, unitId, payments]);

  useEffect(() => {
    fetchPaymentData();
  }, [leaseId]);

  const fetchPaymentData = async () => {
    try {
      setLoading(true);

      const data = await retryWithBackoff(
        async () => {
          // limit=100 (the API maximum) because calculateSummary() below totals
          // whatever comes back — with the default page size of 12 the
          // "Total Due / Paid / Overdue / Upcoming" figures were computed from
          // the first 12 rows only and under-reported the rest.
          const response = await fetch(
            `/api/payments?leaseId=${leaseId}&limit=100`
          );

          if (!response.ok) {
            const errorData = await response.json();
            throw new PropertyProError(
              ErrorType.NETWORK,
              errorData.message ||
                t("leases.details.payments.errors.fetchFailed"),
              {
                code: "PAYMENT_FETCH_FAILED",
                retryable: response.status >= 500,
              }
            );
          }

          return response.json();
        },
        3,
        1000
      );

      if (data?.success) {
        setPayments(data?.data ?? []);
        // Summary now derives from invoices — see the invoice effect above.
        // calculateSummary(data?.data ?? []);
      } else {
        throw new PropertyProError(
          ErrorType.DATABASE,
          data?.message || t("leases.details.payments.errors.invalidData"),
          { code: "INVALID_PAYMENT_DATA" }
        );
      }
    } catch (error) {
      console.error("Error fetching payment data:", error);
      showErrorToast(error);
    } finally {
      setLoading(false);
    }
  };

  // Totals come from INVOICES — what was actually billed — rather than from
  // payment rows. Overdue/upcoming are split on the invoice's own outstanding
  // balance and due date rather than on a status enum, so a partly paid or
  // cancelled invoice counts for exactly what is still owed on it.
  const calculateSummary = (invoiceData: any[]) => {
    const now = new Date();

    let totalDue = 0;
    let totalPaid = 0;
    let totalOverdue = 0;
    let totalUpcoming = 0;
    let nextInvoice: any = null;

    invoiceData?.forEach((invoice) => {
      const dueDate = new Date(invoice?.dueDate ?? new Date());
      const isPastDue = dueDate < now;
      const outstanding = invoice?.balanceRemaining ?? 0;

      totalDue += invoice?.totalAmount ?? 0;
      totalPaid += invoice?.amountPaid ?? 0;

      if (outstanding > 0) {
        if (isPastDue) {
          totalOverdue += outstanding;
        } else {
          totalUpcoming += outstanding;

          if (
            !nextInvoice ||
            dueDate < new Date(nextInvoice?.dueDate ?? new Date())
          ) {
            nextInvoice = invoice;
          }
        }
      }
    });

    const paymentProgress = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

    setSummary({
      totalDue,
      totalPaid,
      totalOverdue,
      totalUpcoming,
      paymentProgress,
      nextPaymentDate: nextInvoice?.dueDate || null,
      // The amount still owed on that invoice, not its headline total.
      nextPaymentAmount: nextInvoice?.balanceRemaining || 0,
    });
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      showInfoToast(t("leases.details.payments.toasts.refreshing"));
      await fetchPaymentData();
      showSuccessToast(t("leases.details.payments.toasts.refreshSuccess"));
    } catch (error) {
      console.error("Error refreshing payment data:", error);
      showErrorToast(error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreatePayments = async () => {
    try {
      const response = await fetch(`/api/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: lease?.tenantId?._id || lease?.tenantId,
          propertyId: lease?.propertyId?._id || lease?.propertyId,
          leaseId: leaseId,
          amount: lease?.terms?.rentAmount ?? 0,
          type: "rent",
          dueDate: (() => {
            const now = new Date();
            const leaseStart = new Date(lease?.startDate ?? new Date());
            // Open-ended leases (month tenancies) have no endDate. Defaulting
            // it to `new Date()` treated "no end" as "ends today", which is not
            // the same thing — null means the lease runs indefinitely.
            const leaseEnd = lease?.endDate ? new Date(lease.endDate) : null;

            // Before the lease starts: bill on the start date.
            if (now < leaseStart) return leaseStart.toISOString();

            // Within the lease (or open-ended): bill today.
            if (!leaseEnd || now <= leaseEnd) return now.toISOString();

            // After the lease ended: bill on the last day of the lease.
            //
            // This used to be "30 days before the end", which lands BEFORE the
            // start date on any lease shorter than a month — the API then
            // rejected it with "Payment due date must be within lease period".
            // The end date is always inside the period by definition.
            return leaseEnd.toISOString();
          })(),
          description: t("leases.details.payments.defaultDescription"),
        }),
      });

      const data = await response.json();

      if (data?.success) {
        toast.success(t("leases.details.payments.toasts.createSuccess"));
        fetchPaymentData();
      } else {
        // Show the server's reason. createErrorResponse puts the text in
        // `error`, so reading only the generic string hid messages like
        // "Cannot create payments for inactive leases".
        toast.error(
          data?.error ||
            data?.message ||
            t("leases.details.payments.toasts.createError")
        );
      }
    } catch (error) {
      console.error("Error creating payment:", error);
      toast.error(t("leases.details.payments.toasts.createError"));
    }
  };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.COMPLETED:
        return "text-green-600";
      case PaymentStatus.PENDING:
        return "text-yellow-600";
      case PaymentStatus.OVERDUE:
        return "text-red-600";
      case PaymentStatus.PROCESSING:
        return "text-blue-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusLabel = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PENDING:
        return t("leases.details.payments.status.pending");
      case PaymentStatus.PROCESSING:
        return t("leases.details.payments.status.processing");
      case PaymentStatus.COMPLETED:
        return t("leases.details.payments.status.completed");
      case PaymentStatus.FAILED:
        return t("leases.details.payments.status.failed");
      case PaymentStatus.REFUNDED:
        return t("leases.details.payments.status.refunded");
      case PaymentStatus.OVERDUE:
        return t("leases.details.payments.status.overdue");
      case PaymentStatus.PARTIAL:
        return t("leases.details.payments.status.partial");
      case PaymentStatus.CANCELLED:
        return t("leases.details.payments.status.cancelled");
      case PaymentStatus.UPCOMING:
        return t("leases.details.payments.status.upcoming");
      default:
        return status;
    }
  };

  // Spinner on the initial load only: refreshes reuse the same `loading` flag,
  // and swapping a populated panel for a spinner mid-refresh would flicker.
  if (loading && payments.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner message="" size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PoundSterling className="h-5 w-5" />
                {t("leases.details.payments.dashboardTitle")}
              </CardTitle>
              <CardDescription>
                {t("leases.details.payments.dashboardDescription", {
                  values: {
                    name:
                      lease?.propertyId?.name ||
                      t("leases.details.payments.thisLeaseFallback"),
                  },
                })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                />
                {t("leases.details.payments.refreshButton")}
              </Button>
              <Button size="sm" onClick={handleCreatePayments}>
                <Plus className="h-4 w-4 mr-2" />
                {t("leases.details.payments.createPaymentButton")}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("leases.details.payments.totalDueLabel")}
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(summary?.totalDue ?? 0)}
                </p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <PoundSterling className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("leases.details.payments.totalPaidLabel")}
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(summary.totalPaid)}
                </p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("leases.details.payments.overdueLabel")}
                </p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(summary.totalOverdue)}
                </p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("leases.details.payments.upcomingLabel")}
                </p>
                <p className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(summary.totalUpcoming)}
                </p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t("leases.details.payments.paymentProgressTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t("leases.details.payments.overallProgressLabel")}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatNumber(summary.paymentProgress, {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            </div>
            <Progress value={summary.paymentProgress} className="h-2" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("leases.details.payments.paidLabel", {
                  values: { amount: formatCurrency(summary.totalPaid) },
                })}
              </span>
              <span className="text-muted-foreground">
                {t("leases.details.payments.totalLabel", {
                  values: { amount: formatCurrency(summary.totalDue) },
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Payment Alert */}
      {summary.nextPaymentDate && (
        <Alert>
          <Calendar className="h-4 w-4" />
          <AlertDescription>
            {t("leases.details.payments.nextPaymentLabel", {
              values: {
                amount: formatCurrency(summary.nextPaymentAmount),
                date: summary.nextPaymentDate
                  ? formatDate(summary.nextPaymentDate)
                  : "",
              },
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Invoice stats — the same AnalyticsCard set the invoices page shows,
          counted over this lease's invoices rather than the whole portfolio.
          Hidden for tenants there, so hidden here too. */}
      {!isTenant && (
        <AnalyticsCardGrid className="lg:grid-cols-6">
          <AnalyticsCard
            title={t("leases.invoices.stats.total")}
            value={invoiceStats.total}
            icon={FileText}
            iconColor="primary"
          />
          <AnalyticsCard
            title={t("leases.invoices.stats.paid")}
            value={invoiceStats.paid}
            icon={CheckCircle}
            iconColor="success"
          />
          <AnalyticsCard
            title={t("leases.invoices.stats.issued")}
            value={invoiceStats.issued}
            icon={Send}
            iconColor="info"
          />
          <AnalyticsCard
            title={t("leases.invoices.stats.overdue")}
            value={invoiceStats.overdue}
            icon={AlertTriangle}
            iconColor="error"
          />
          <AnalyticsCard
            title={t("leases.invoices.stats.partial")}
            value={invoiceStats.partial}
            icon={Clock}
            iconColor="warning"
          />
          <AnalyticsCard
            title={t("leases.invoices.stats.totalValue")}
            value={formatCurrency(invoiceStats.totalAmount)}
            icon={PoundSterling}
            iconColor="primary"
          />
        </AnalyticsCardGrid>
      )}

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("leases.details.payments.recentPaymentsTitle")}
          </CardTitle>
          <CardDescription>
            {t("leases.details.payments.recentPaymentsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {t("leases.details.payments.noPaymentsMessage")}
              </p>
              <Button className="mt-4" onClick={handleCreatePayments}>
                {t("leases.details.payments.createFirstPaymentButton")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.slice(0, 5).map((invoice: any) => (
                <div
                  key={invoice._id?.toString()}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {invoice.lineItems?.[0]?.description ||
                          invoice.invoiceNumber ||
                          "Invoice"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {invoice.invoiceNumber ? `${invoice.invoiceNumber} · ` : ""}
                        {t("leases.details.payments.dueOnLabel", {
                          values: { date: formatDate(invoice.dueDate) },
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {formatCurrency(invoice.totalAmount ?? 0)}
                    </p>
                    {/* Outstanding, not the headline total — a partly paid
                        invoice otherwise looks untouched. */}
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(invoice.balanceRemaining ?? 0)} due
                    </p>
                    <Badge
                      variant={
                        (invoice.balanceRemaining ?? 0) <= 0
                          ? "default"
                          : "secondary"
                      }
                      className="capitalize"
                    >
                      {invoice.status ?? "unknown"}
                    </Badge>
                  </div>
                </div>
              ))}

              {invoices.length > 5 && (
                <div className="text-center pt-4">
                  <Button variant="outline" size="sm">
                    {t("leases.details.payments.viewAllButton")} (
                    {invoices.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
