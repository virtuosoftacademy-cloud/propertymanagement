"use client";

/**
 * Manager Accounts — ADMIN only (enforced server-side by ./layout.tsx).
 *
 * The admin is the vendor here: clients pay the admin to be given a Manager
 * account, so this is a revenue view, not a bill the org owes.
 *
 * Reads GET /api/billing/subscriptions.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  PoundSterling,
  CalendarClock,
  AlertTriangle,
  Download,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { GlobalSearch } from "@/components/ui/global-search";
import { GlobalPagination } from "@/components/ui/global-pagination";
import { ManagerAccountsTable } from "@/components/billing/manager-accounts-table";
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog";
import { ManagerAccountFormDialog } from "@/components/billing/manager-account-form-dialog";
import {
  useManagerAccounts,
  EMPTY_ACCOUNTS_VIEW,
} from "@/hooks/useManagerBilling";
import { MANAGER_PLANS, resolvePlan } from "@/lib/billing/plans";
import {
  showSimpleError,
  showSimpleInfo,
  showSimpleSuccess,
} from "@/lib/toast-notifications";
import { downloadCsv, downloadPdf, exportFilename } from "@/lib/utils/export";
import type { Subscription } from "@/types/billing";

const formatCurrency = (amount: number) =>
  `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB");
};

/** Mirrors the badge labels in the accounts table. */
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
  expired: "Expired",
};

export default function ManagerAccountsPage() {
  const router = useRouter();

  const {
    data,
    loading,
    error: loadError,
    refetch,
  } = useManagerAccounts();
  const { summary, accounts } = data ?? EMPTY_ACCOUNTS_VIEW;

  const [paymentTarget, setPaymentTarget] = useState<Subscription | null>(
    null
  );
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Fires once per distinct empty result rather than on every keystroke.
  const lastEmptyRef = useRef<string | null>(null);

  /**
   * Matches the fields visible in the table, plus the plan's display name —
   * searching "Growth" should find its accounts even though the row stores the
   * planId, not the label.
   */
  const matchAccounts = (term: string, status: string, plan: string) => {
    const needle = term.trim().toLowerCase();

    return accounts.filter((account) => {
      if (status !== "all" && account.status !== status) return false;
      if (plan !== "all" && account.planId !== plan) return false;
      if (!needle) return true;

      return [
        account.clientName,
        account.companyName,
        account.contactEmail,
        account.contactPhone,
        account.userName,
        resolvePlan(account.planId)?.name ?? account.planId,
        account.status.replace(/_/g, " "),
        // So "company" and "individual" work as search terms, matching the
        // badge shown in the table.
        account.companyName ? "company" : "individual",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  };

  const filteredAccounts = useMemo(
    () => matchAccounts(searchTerm, statusFilter, planFilter),
    // matchAccounts is derived from `accounts`, the only other input.
    [accounts, searchTerm, statusFilter, planFilter]
  );

  const filtersActive =
    Boolean(searchTerm.trim()) || statusFilter !== "all" || planFilter !== "all";

  /** Human description of what is currently narrowing the list. */
  const filterSummary = [
    searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
    statusFilter !== "all" ? STATUS_LABELS[statusFilter] : null,
    planFilter !== "all"
      ? (resolvePlan(planFilter)?.name ?? planFilter)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ─── Pagination ───────────────────────────────────────────────────────────
  // Clamped rather than trusted: filtering down while on a later page would
  // otherwise leave the reader staring at an empty table with rows that exist.
  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedAccounts = useMemo(
    () =>
      filteredAccounts.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
      ),
    [filteredAccounts, currentPage, pageSize]
  );

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setPlanFilter("all");
    setPage(1);
    lastEmptyRef.current = null;
  };

  /**
   * Fires once per distinct empty result across all three controls, so
   * narrowing to nothing by status or plan is as obvious as by search.
   */
  const notifyIfEmpty = (term: string, status: string, plan: string) => {
    const key = `${term.trim()}|${status}|${plan}`;
    const active =
      Boolean(term.trim()) || status !== "all" || plan !== "all";

    if (active && matchAccounts(term, status, plan).length === 0) {
      if (lastEmptyRef.current !== key) {
        lastEmptyRef.current = key;
        showSimpleInfo(
          "No accounts found",
          "No manager accounts match the current filters."
        );
      }
    } else {
      lastEmptyRef.current = null;
    }
  };

  // Each handler passes the incoming value: state has not updated yet at the
  // moment these run, so reading it back would check the previous selection.
  // Every filter change returns to page 1 — staying on page 3 of a result set
  // that just shrank to four rows shows nothing.
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
    notifyIfEmpty(value, statusFilter, planFilter);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    notifyIfEmpty(searchTerm, value, planFilter);
  };

  const handlePlanChange = (value: string) => {
    setPlanFilter(value);
    setPage(1);
    notifyIfEmpty(searchTerm, statusFilter, value);
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  // Exports every row matching the current filters, not just the visible page —
  // downloading page 1 of 4 when you asked for "all past due" would be a trap.
  const exportRows = () =>
    filteredAccounts.map((account) => ({
      Client: account.clientName,
      Type: account.companyName ? "Company" : "Individual",
      Company: account.companyName ?? "—",
      Email: account.contactEmail,
      Plan: resolvePlan(account.planId)?.name ?? account.planId,
      Cycle: account.billingCycle,
      Amount: `£${account.amount.toFixed(2)}`,
      Status: account.status.replace(/_/g, " "),
      "Last paid": formatDate(account.lastPaymentAt),
      Renews: formatDate(account.renewsAt),
    }));

  const exportColumns = [
    // Widths total 724pt against 761.89pt usable in landscape A4. Email gets
    // the most room because a truncated address is the least recoverable value
    // in the row; the CSV carries everything in full regardless.
    { key: "Client", label: "Client", width: 80 },
    { key: "Type", label: "Type", width: 56 },
    { key: "Company", label: "Company", width: 96 },
    { key: "Email", label: "Email", width: 130 },
    { key: "Plan", label: "Plan", width: 56 },
    { key: "Cycle", label: "Cycle", width: 52 },
    { key: "Amount", label: "Amount", width: 62 },
    { key: "Status", label: "Status", width: 64 },
    { key: "Last paid", label: "Last paid", width: 64 },
    { key: "Renews", label: "Renews", width: 64 },
  ];

  const exportSubtitle = () =>
    [
      filtersActive
        ? `Filtered by ${filterSummary} — ${filteredAccounts.length} of ${accounts.length}`
        : `${accounts.length} accounts`,
      `${summary.activeAccounts} active`,
      `${formatCurrency(summary.monthlyRevenue)} monthly revenue`,
      `generated ${new Date().toLocaleString("en-GB")}`,
    ].join(" · ");

  const handleExportCsv = () => {
    const count = downloadCsv(
      exportRows(),
      exportFilename("manager-accounts", "csv")
    );
    if (count === 0) {
      toast.error("There is nothing to export.");
      return;
    }
    toast.success(`Exported ${count} account(s) to CSV.`);
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const count = await downloadPdf(exportRows(), exportColumns, {
        title: "Manager Accounts",
        filename: exportFilename("manager-accounts", "pdf"),
        subtitle: exportSubtitle(),
      });
      if (count === 0) {
        toast.error("There is nothing to export.");
        return;
      }
      toast.success(`Exported ${count} account(s) to PDF.`);
    } catch (error) {
      console.error("[manager accounts] PDF export failed:", error);
      toast.error("Failed to generate the PDF export.");
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Refresh ──────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSearchTerm("");
    setStatusFilter("all");
    setPlanFilter("all");
    setPage(1);
    lastEmptyRef.current = null;
    await refetch();
    setIsRefreshing(false);
  };

  const openPayment = (account: Subscription) => {
    setPaymentTarget(account);
    setPaymentOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Users className="h-7 w-7" />
            Manager Accounts
          </h1>
          <p className="text-muted-foreground">
            Accounts sold to clients and the income they bring in.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isExporting || filteredAccounts.length === 0}
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

          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add subscription
          </Button>
        </div>
      </div>

      {/* A failed load must be visible: silently showing zeroes would read as
          "no accounts sold", which is a very different thing from "not loaded". */}
      {loadError && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span className="text-destructive">
            Could not load accounts: {loadError}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* Revenue summary */}
      <AnalyticsCardGrid className="lg:grid-cols-4">
        <AnalyticsCard
          title="Active accounts"
          value={summary.activeAccounts.toLocaleString("en-GB")}
          description={`${summary.totalAccounts} sold in total`}
          icon={Users}
          iconColor="primary"
        />
        <AnalyticsCard
          title="Monthly revenue"
          value={formatCurrency(summary.monthlyRevenue)}
          description="Annual plans counted pro rata"
          icon={PoundSterling}
          iconColor="success"
        />
        <AnalyticsCard
          title="Renewals this month"
          value={summary.renewalsThisMonth.toLocaleString("en-GB")}
          description="Payments due from clients"
          icon={CalendarClock}
          iconColor="info"
        />
        <AnalyticsCard
          title="Outstanding"
          value={formatCurrency(summary.outstanding)}
          description={
            summary.outstanding > 0 ? "Past due — needs chasing" : "All settled"
          }
          icon={AlertTriangle}
          iconColor={summary.outstanding > 0 ? "error" : "success"}
        />
      </AnalyticsCardGrid>

      {/* Search.
          The summary cards above deliberately stay on the full set — they are
          the revenue picture, not a description of the search results — so the
          count below states the relationship rather than leaving the reader to
          wonder why the cards did not move. */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex-1">
            <GlobalSearch
              placeholder="Search by client, company, email, plan or status"
              initialValue={searchTerm}
              onSearch={handleSearch}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[170px]">
                <Filter className="mr-2 h-4 w-4 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={handlePlanChange}>
              <SelectTrigger className="w-[170px]">
                <Layers className="mr-2 h-4 w-4 shrink-0" />
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

            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* The summary cards above deliberately stay on the full set — they are
            the revenue picture, not a description of the filtered rows — so
            state the relationship rather than leaving it to be puzzled out. */}
        {filtersActive && (
          <p className="text-muted-foreground text-sm">
            {filteredAccounts.length} of {accounts.length} accounts match
            {filterSummary ? ` ${filterSummary}` : ""}. Totals above cover all
            accounts; Export covers all matches.
          </p>
        )}
      </div>

      {/* The table's own empty state says "no accounts sold", which is a lie
          while the first request is still in flight. */}
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 rounded-md border py-12 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading accounts…
        </div>
      ) : (
        <ManagerAccountsTable
          accounts={pagedAccounts}
          filterSummary={filtersActive ? filterSummary : undefined}
          onRecordPayment={openPayment}
          onEdit={(account) =>
            router.push(`/dashboard/admin/billing/${account.id}/edit`)
          }
        />
      )}

      {/* Hidden when everything fits on one page — a pager over 6 rows is
          noise. Counts are of the filtered set, not the whole list. */}
      {filteredAccounts.length > 0 && totalPages > 1 && (
        <GlobalPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredAccounts.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <RecordPaymentDialog
        account={paymentTarget}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        onConfirm={async (amount, receivedOn, notes) => {
          if (!paymentTarget) return;

          const response = await fetch("/api/billing/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId: paymentTarget.id,
              amount,
              receivedOn: receivedOn || new Date().toISOString(),
              notes: notes || undefined,
            }),
          });
          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.success) {
            showSimpleError(
              "Payment not recorded",
              result?.error || "The payment could not be saved."
            );
            return;
          }

          showSimpleSuccess(
            "Payment recorded",
            `${formatCurrency(amount)} from ${paymentTarget.clientName}.`
          );
          setPaymentOpen(false);
          await refetch();
        }}
      />

      <ManagerAccountFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          const response = await fetch("/api/billing/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.success) {
            showSimpleError(
              "Account not created",
              result?.error || "The account could not be saved."
            );
            return;
          }

          showSimpleSuccess(
            "Subscription added",
            `${values.clientName} has been recorded.`
          );
          setCreateOpen(false);
          await refetch();
        }}
      />
    </div>
  );
}
