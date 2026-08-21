"use client";

/**
 * Payment history — ADMIN only.
 *
 * The guard is inherited from src/app/dashboard/admin/billing/layout.tsx.
 *
 * Cash is recorded after the fact, so this ledger is the only record that money
 * changed hands — there is no payment provider to reconcile against. That is
 * why `recordedBy` is a column rather than a detail.
 *
 * UI ONLY. Rows come from a fixture derived from the accounts, so the ledger
 * agrees with each account's lastPaymentAt.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  Download,
  Filter,
  Hash,
  PoundSterling,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { GlobalSearch } from "@/components/ui/global-search";
import { GlobalPagination } from "@/components/ui/global-pagination";
import {
  useManagerPayments,
  EMPTY_PAYMENTS_VIEW,
} from "@/hooks/useManagerBilling";
import { MANAGER_PLANS, resolvePlan } from "@/lib/billing/plans";
import { showSimpleInfo } from "@/lib/toast-notifications";
import { downloadCsv, downloadPdf, exportFilename } from "@/lib/utils/export";

const formatCurrency = (amount: number) =>
  `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatAmount = (amount: number) =>
  `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB");
};

export default function PaymentHistoryPage() {
  const router = useRouter();

  const { data, loading, error: loadError, refetch } = useManagerPayments();
  const { summary, payments } = data ?? EMPTY_PAYMENTS_VIEW;

  const [searchTerm, setSearchTerm] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [isExporting, setIsExporting] = useState(false);

  const lastEmptyRef = useRef<string | null>(null);

  // Years present in the data, so the filter never offers an empty option.
  const years = useMemo(
    () =>
      Array.from(
        new Set(payments.map((p) => new Date(p.receivedOn).getUTCFullYear()))
      ).sort((a, b) => b - a),
    [payments]
  );

  const matchPayments = (term: string, plan: string, year: string) => {
    const needle = term.trim().toLowerCase();

    return payments.filter((payment) => {
      if (plan !== "all" && payment.planId !== plan) return false;
      if (
        year !== "all" &&
        new Date(payment.receivedOn).getUTCFullYear() !== Number(year)
      ) {
        return false;
      }
      if (!needle) return true;

      return [
        payment.clientName,
        payment.companyName,
        resolvePlan(payment.planId)?.name ?? payment.planId,
        payment.recordedBy,
        payment.periodLabel,
        payment.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  };

  const filteredPayments = useMemo(
    () => matchPayments(searchTerm, planFilter, yearFilter),
    [payments, searchTerm, planFilter, yearFilter]
  );

  const filtersActive =
    Boolean(searchTerm.trim()) || planFilter !== "all" || yearFilter !== "all";

  const filterSummary = [
    searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
    planFilter !== "all" ? (resolvePlan(planFilter)?.name ?? planFilter) : null,
    yearFilter !== "all" ? yearFilter : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /** Total of what is currently filtered — the number the admin is chasing. */
  const filteredTotal = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPayments = useMemo(
    () =>
      filteredPayments.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
      ),
    [filteredPayments, currentPage, pageSize]
  );

  const notifyIfEmpty = (term: string, plan: string, year: string) => {
    const key = `${term.trim()}|${plan}|${year}`;
    const active =
      Boolean(term.trim()) || plan !== "all" || year !== "all";

    if (active && matchPayments(term, plan, year).length === 0) {
      if (lastEmptyRef.current !== key) {
        lastEmptyRef.current = key;
        showSimpleInfo(
          "No payments found",
          "No payments match the current filters."
        );
      }
    } else {
      lastEmptyRef.current = null;
    }
  };

  // Each handler passes the incoming value — state has not updated yet.
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
    notifyIfEmpty(value, planFilter, yearFilter);
  };

  const handlePlanChange = (value: string) => {
    setPlanFilter(value);
    setPage(1);
    notifyIfEmpty(searchTerm, value, yearFilter);
  };

  const handleYearChange = (value: string) => {
    setYearFilter(value);
    setPage(1);
    notifyIfEmpty(searchTerm, planFilter, value);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setPlanFilter("all");
    setYearFilter("all");
    setPage(1);
    lastEmptyRef.current = null;
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  // Every matching payment, not just the visible page.
  const exportRows = () =>
    filteredPayments.map((payment) => ({
      Date: formatDate(payment.receivedOn),
      Client: payment.clientName,
      Company: payment.companyName ?? "—",
      Plan: resolvePlan(payment.planId)?.name ?? payment.planId,
      Period: payment.periodLabel ?? "—",
      Amount: payment.amount.toFixed(2),
      Method: "Cash",
      "Recorded by": payment.recordedBy,
    }));

  const exportColumns = [
    // 700pt of 761.89pt usable in landscape A4.
    { key: "Date", label: "Date", width: 72 },
    { key: "Client", label: "Client", width: 110 },
    { key: "Company", label: "Company", width: 130 },
    { key: "Plan", label: "Plan", width: 70 },
    { key: "Period", label: "Period", width: 80 },
    { key: "Amount", label: "Amount (£)", width: 78 },
    { key: "Method", label: "Method", width: 62 },
    { key: "Recorded by", label: "Recorded by", width: 98 },
  ];

  const exportSubtitle = () =>
    [
      filtersActive
        ? `Filtered by ${filterSummary} — ${filteredPayments.length} of ${payments.length}`
        : `${payments.length} payments`,
      `${formatCurrency(filteredTotal)} total`,
      `generated ${new Date().toLocaleString("en-GB")}`,
    ].join(" · ");

  const handleExportCsv = () => {
    const count = downloadCsv(
      exportRows(),
      exportFilename("manager-payments", "csv")
    );
    if (count === 0) {
      toast.error("There is nothing to export.");
      return;
    }
    toast.success(`Exported ${count} payment(s) to CSV.`);
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const count = await downloadPdf(exportRows(), exportColumns, {
        title: "Manager Account Payments",
        filename: exportFilename("manager-payments", "pdf"),
        subtitle: exportSubtitle(),
      });
      if (count === 0) {
        toast.error("There is nothing to export.");
        return;
      }
      toast.success(`Exported ${count} payment(s) to PDF.`);
    } catch (error) {
      console.error("[manager payments] PDF export failed:", error);
      toast.error("Failed to generate the PDF export.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin/billing")}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manager Accounts
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <Banknote className="h-7 w-7" />
              Payment History
            </h1>
            <p className="text-muted-foreground">
              Cash received from clients for their manager accounts.
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={isExporting || filteredPayments.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary */}
      {/* Showing zeroes on a failed load would read as "nothing received". */}
      {loadError && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span className="text-destructive">
            Could not load payments: {loadError}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading payments…</p>
      )}

      <AnalyticsCardGrid className="lg:grid-cols-4">
        <AnalyticsCard
          title="Total received"
          value={formatCurrency(summary.totalReceived)}
          description="All time"
          icon={PoundSterling}
          iconColor="success"
        />
        <AnalyticsCard
          title="Received this month"
          value={formatCurrency(summary.receivedThisMonth)}
          description="Current calendar month"
          icon={CalendarClock}
          iconColor="primary"
        />
        <AnalyticsCard
          title="Payments recorded"
          value={summary.paymentCount.toLocaleString("en-GB")}
          description="Every cash payment logged"
          icon={Hash}
          iconColor="info"
        />
        <AnalyticsCard
          title="Average payment"
          value={formatCurrency(summary.averagePayment)}
          description="Across all payments"
          icon={Banknote}
          iconColor="info"
        />
      </AnalyticsCardGrid>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex-1">
            <GlobalSearch
              placeholder="Search by client, company, plan, period or who recorded it"
              initialValue={searchTerm}
              onSearch={handleSearch}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={planFilter} onValueChange={handlePlanChange}>
              <SelectTrigger className="w-[160px]">
                <Filter className="mr-2 h-4 w-4 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {MANAGER_PLANS.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={yearFilter} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[130px]">
                <CalendarClock className="mr-2 h-4 w-4 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {filtersActive && (
          <p className="text-muted-foreground text-sm">
            {filteredPayments.length} of {payments.length} payments match{" "}
            {filterSummary}, totalling {formatCurrency(filteredTotal)}. Cards
            above cover all payments; Export covers all matches.
          </p>
        )}
      </div>

      {/* Ledger */}
      <Card className="gap-2 shadow-md dark:shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Most recent first. Cash is recorded manually, so every row names who
            logged it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pagedPayments.length === 0 ? (
            <div className="py-16 text-center">
              <Banknote className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-1 text-lg font-medium">
                {filtersActive ? "No matching payments" : "No payments yet"}
              </h3>
              <p className="text-muted-foreground">
                {filtersActive
                  ? `Nothing matches ${filterSummary}. Try widening the filters.`
                  : "Payments you record against manager accounts will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Recorded by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedPayments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(
                          `/dashboard/admin/billing/${payment.subscriptionId}/edit`
                        )
                      }
                    >
                      <TableCell className="text-sm">
                        {formatDate(payment.receivedOn)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {payment.companyName || payment.clientName}
                        </div>
                        {payment.companyName && (
                          <div className="text-muted-foreground text-xs">
                            {payment.clientName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {resolvePlan(payment.planId)?.name ?? payment.planId}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {payment.periodLabel ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatAmount(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <Banknote className="h-3 w-3" />
                          Cash
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {payment.recordedBy}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {filteredPayments.length > 0 && totalPages > 1 && (
        <GlobalPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredPayments.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
