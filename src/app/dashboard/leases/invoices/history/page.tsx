"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
} from "lucide-react";
import {
  showSimpleError,
  showSimpleSuccess,
  showSimpleInfo,
} from "@/lib/toast-notifications";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { UserRole } from "@/types";

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

  // Fires once per distinct empty result rather than on every refetch.
  const lastEmptyRef = useRef<string | null>(null);

  const fetchHistory = useCallback(async (page: number, search: string) => {
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

      const term = (search || "").trim();
      if ((meta.total ?? rows.length) === 0) {
        const key = term || "__no-search__";
        if (lastEmptyRef.current !== key) {
          lastEmptyRef.current = key;
          showSimpleInfo(
            term ? "No deleted invoices found" : "No deleted invoices",
            term
              ? `No deleted invoices match "${term}".`
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
  }, []);

  // Tenants have no business in the deletion log.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === UserRole.TENANT) {
      router.replace("/dashboard/leases/invoices");
    }
  }, [status, session?.user?.role, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.role === UserRole.TENANT) return;
    fetchHistory(pagination.page, searchTerm);
  }, [status, session?.user?.role, pagination.page, searchTerm, fetchHistory]);

  const handleRestore = async (invoice: DeletedInvoice) => {
    try {
      setRestoringId(invoice._id);

      const response = await fetch(`/api/invoices/${invoice._id}`, {
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

      showSimpleSuccess(
        "Invoice restored",
        "It has been returned to the invoice list."
      );
      // Drop it from the history view it was just restored out of.
      setInvoices((prev) => prev.filter((i) => i._id !== invoice._id));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch (error) {
      showSimpleError(
        "Restore failed",
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setRestoringId(null);
    }
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
          <GlobalSearch
            placeholder="Search deleted invoices by number, property or tenant"
            initialValue={searchTerm}
            onSearch={(value) => {
              setSearchTerm(value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            isLoading={loading}
          />

          {loading ? (
            <div className="flex justify-center items-center py-16">
              <LoadingSpinner message="" size="lg" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-16">
              <FileX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No deleted invoices</h3>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "No deleted invoices match your search."
                  : "Deleted invoices will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                              disabled={restoringId === invoice._id}
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
