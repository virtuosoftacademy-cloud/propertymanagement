"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlobalSearch } from "@/components/ui/global-search";
import { GlobalPagination } from "@/components/ui/global-pagination";
import { LoadingSpinner } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Eye,
  FileX,
  MoreHorizontal,
  RotateCcw,
  History,
  X,
} from "lucide-react";
import {
  showSimpleError,
  showSimpleSuccess,
  showSimpleInfo,
} from "@/lib/toast-notifications";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { InvoiceStatus, UserRole } from "@/types";

interface DeletedInvoice {
  _id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  dueDate: string;
  deletedAt: string | null;
  propertyId?: { name?: string } | null;
  tenantId?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
}

/**
 * Invoice history — soft-deleted invoices only.
 *
 * The normal list can never show these: the Invoice model's `pre(/^find/)` hook
 * excludes `deletedAt` records unless a query names that field, which the API
 * does only when `deleted=true`.
 */
export default function InvoiceHistoryPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { formatCurrency } = useLocalizationContext();

  const [invoices, setInvoices] = useState<DeletedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0,
  });

  // Filters.
  const [statusFilter, setStatusFilter] = useState("all");
  const [deletedFrom, setDeletedFrom] = useState<Date | undefined>();
  const [deletedTo, setDeletedTo] = useState<Date | undefined>();

  const hasActiveFilters =
    Boolean(searchTerm) ||
    statusFilter !== "all" ||
    Boolean(deletedFrom) ||
    Boolean(deletedTo);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDeletedFrom(undefined);
    setDeletedTo(undefined);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Row selection, for the bulk restore below the table.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const allOnPageSelected =
    invoices.length > 0 && invoices.every((i) => selectedIds.includes(i._id));

  // Fires once per distinct empty result rather than on every refetch.
  const lastEmptyRef = useRef<string | null>(null);

  const fetchHistory = useCallback(
    async (
      page: number,
      search: string,
      statusValue: string,
      from?: Date,
      to?: Date
    ) => {
      try {
        setLoading(true);

        const params = new URLSearchParams({
          deleted: "true",
          page: String(page),
          limit: "12",
          sortBy: "deletedAt",
          sortOrder: "desc",
        });
        if (search) params.set("search", search);
        if (statusValue !== "all") params.set("status", statusValue);
        if (from) params.set("deletedFrom", from.toISOString().slice(0, 10));
        if (to) params.set("deletedTo", to.toISOString().slice(0, 10));

        const response = await fetch(`/api/invoices?${params}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          // createErrorResponse puts the explanation in `error`, not `message`.
          throw new Error(
            result.error || result.message || "Could not load invoice history"
          );
        }

        const rows: DeletedInvoice[] = result.data?.invoices || [];
        const meta = result.data?.pagination || {};

        setInvoices(rows);
        setPagination({
          page: meta.page ?? page,
          limit: meta.limit ?? 12,
          total: meta.total ?? rows.length,
          pages: meta.pages ?? 0,
        });
        // Filters just changed the result set — stale selections from the
        // previous page would otherwise "restore" rows nobody can see anymore.
        setSelectedIds([]);

        const term = (search || "").trim();
        const filtersApplied =
          Boolean(term) || statusValue !== "all" || Boolean(from) || Boolean(to);
        if ((meta.total ?? rows.length) === 0) {
          const key = filtersApplied
            ? `${term}|${statusValue}|${from?.getTime() ?? ""}|${to?.getTime() ?? ""}`
            : "__no-search__";
          if (lastEmptyRef.current !== key) {
            lastEmptyRef.current = key;
            showSimpleInfo(
              filtersApplied ? "No deleted invoices found" : "No deleted invoices",
              filtersApplied
                ? "No deleted invoices match these filters."
                : "Nothing has been deleted yet."
            );
          }
        } else {
          lastEmptyRef.current = null;
        }
      } catch (error) {
        showSimpleError(
          "Load failed",
          error instanceof Error
            ? error.message
            : "Could not load invoice history"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Tenants have no business in the deletion log.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === UserRole.TENANT) {
      router.replace("/dashboard/leases/invoices");
    }
  }, [status, session?.user?.role, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.role === UserRole.TENANT) return;
    fetchHistory(pagination.page, searchTerm, statusFilter, deletedFrom, deletedTo);
  }, [
    status,
    session?.user?.role,
    pagination.page,
    searchTerm,
    statusFilter,
    deletedFrom,
    deletedTo,
    fetchHistory,
  ]);

  const restoreOne = async (id: string) => {
    const response = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ operation: "restore" }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(
        result.error || result.message || "Failed to restore invoice"
      );
    }
  };

  const handleRestore = async (invoice: DeletedInvoice) => {
    try {
      setRestoringId(invoice._id);
      await restoreOne(invoice._id);
      showSimpleSuccess(
        "Invoice restored",
        "It has been returned to the invoice list."
      );
      // Drop it from the history view it was just restored out of.
      setInvoices((prev) => prev.filter((i) => i._id !== invoice._id));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setSelectedIds((prev) => prev.filter((id) => id !== invoice._id));
    } catch (error) {
      showSimpleError(
        "Restore failed",
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setRestoringId(null);
    }
  };

  const handleBulkRestore = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setBulkRestoring(true);
    const results = await Promise.allSettled(ids.map((id) => restoreOne(id)));
    setBulkRestoring(false);

    const restoredIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const failedCount = results.length - restoredIds.length;

    if (restoredIds.length > 0) {
      setInvoices((prev) => prev.filter((i) => !restoredIds.includes(i._id)));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - restoredIds.length),
      }));
      setSelectedIds((prev) => prev.filter((id) => !restoredIds.includes(id)));
    }

    if (failedCount === 0) {
      showSimpleSuccess(
        restoredIds.length === 1 ? "Invoice restored" : "Invoices restored",
        `${restoredIds.length} invoice${
          restoredIds.length === 1 ? "" : "s"
        } returned to the invoice list.`
      );
    } else if (restoredIds.length === 0) {
      showSimpleError(
        "Restore failed",
        `Could not restore ${failedCount === 1 ? "that invoice" : `any of the ${failedCount} selected invoices`}.`
      );
    } else {
      showSimpleInfo(
        "Partially restored",
        `${restoredIds.length} restored, ${failedCount} failed. The failed ones are still selected.`
      );
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((sid) => sid !== id)
    );
  };

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        const pageIds = invoices.map((i) => i._id);
        return [...new Set([...prev, ...pageIds])];
      }
      const pageIds = new Set(invoices.map((i) => i._id));
      return prev.filter((id) => !pageIds.has(id));
    });
  };

  const formatUkDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleDateString("en-GB");
  };

  const tenantName = (invoice: DeletedInvoice) =>
    [invoice.tenantId?.firstName, invoice.tenantId?.lastName]
      .filter(Boolean)
      .join(" ") || "—";

  if (session?.user?.role === UserRole.TENANT) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <History className="h-7 w-7" />
              Invoice History
            </h1>
            <p className="text-muted-foreground">
              Deleted invoices, kept for reference. Restore one to return it to
              the invoice list.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/leases/invoices")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <GlobalSearch
              placeholder="Search deleted invoices by number, property or tenant"
              initialValue={searchTerm}
              onSearch={(value) => {
                setSearchTerm(value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              isLoading={loading}
              className="flex-1"
            />

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            >
              <SelectTrigger className="h-10 w-full sm:w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.values(InvoiceStatus).map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DatePicker
              date={deletedFrom}
              onSelect={(date) => {
                setDeletedFrom(date);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              placeholder="Deleted from"
              className="sm:w-[160px]"
              disabled={(date) => (deletedTo ? date > deletedTo : false)}
            />

            <DatePicker
              date={deletedTo}
              onSelect={(date) => {
                setDeletedTo(date);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              placeholder="Deleted to"
              className="sm:w-[160px]"
              disabled={(date) => (deletedFrom ? date < deletedFrom : false)}
            />

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-16">
              <LoadingSpinner message="" size="lg" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-16">
              <FileX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No deleted invoices</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? "No deleted invoices match these filters."
                  : "Deleted invoices will appear here."}
              </p>
            </div>
          ) : (
            <>
              {selectedIds.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2.5">
                  <span className="text-sm font-medium">
                    {selectedIds.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds([])}
                      disabled={bulkRestoring}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleBulkRestore}
                      disabled={bulkRestoring}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {bulkRestoring
                        ? "Restoring…"
                        : `Restore ${selectedIds.length}`}
                    </Button>
                  </div>
                </div>
              )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(checked) =>
                          toggleAllOnPage(checked === true)
                        }
                        aria-label="Select all deleted invoices on this page"
                      />
                    </TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice._id} className="opacity-90">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(invoice._id)}
                          onCheckedChange={(checked) =>
                            toggleRow(invoice._id, checked === true)
                          }
                          disabled={
                            restoringId === invoice._id ||
                            (bulkRestoring && selectedIds.includes(invoice._id))
                          }
                          aria-label={`Select invoice ${invoice.invoiceNumber || invoice._id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {invoice.invoiceNumber || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Due {formatUkDate(invoice.dueDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {invoice.propertyId?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{tenantName(invoice)}</div>
                        <div className="text-xs text-muted-foreground">
                          {invoice.tenantId?.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {invoice.status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {formatCurrency(invoice.totalAmount ?? 0)}
                        </div>
                        {(invoice.balanceRemaining ?? 0) > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(invoice.balanceRemaining)}{" "}
                            outstanding
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatUkDate(invoice.deletedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={
                                restoringId === invoice._id ||
                                (bulkRestoring && selectedIds.includes(invoice._id))
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRestore(invoice)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Restore Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                // deleted=true, or the detail lookup can't see
                                // past the soft-delete hook and 404s.
                                router.push(
                                  `/dashboard/leases/invoices/${invoice._id}?deleted=true`
                                )
                              }
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}

          {pagination.total > 0 && (
            <GlobalPagination
              currentPage={pagination.page}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              pageSize={pagination.limit}
              onPageChange={(page) =>
                setPagination((prev) => ({ ...prev, page }))
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
