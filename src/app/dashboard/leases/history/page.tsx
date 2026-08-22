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
import { LeaseStatusBadge } from "@/components/leases/LeaseStatusBadge";
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
import { LeaseStatus, UserRole } from "@/types";
import {
  leaseService,
  LeaseResponse,
  LeaseQueryParams,
} from "@/lib/services/lease.service";

/**
 * Lease history — soft-deleted leases only.
 *
 * The normal list can never show these: the Lease model's `pre(/^find/)` hook
 * excludes `deletedAt` records unless a query names that field, which the API
 * does only when `deleted=true`.
 *
 * Bulk restore only — there is no bulk delete here, because there is no
 * PERMANENT delete for leases at all: DELETE /api/leases/[id] only soft-
 * deletes, which is what put the lease in this list in the first place. That
 * is unlike the user history page, which has a real hard-delete behind an
 * impact check; building an equivalent for leases (a new hard-delete route,
 * plus deciding what "referenced by other records" even means for a lease)
 * is a separate, larger piece of work, not implied by mirroring this page.
 */
export default function LeaseHistoryPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t, formatCurrency, formatDate } = useLocalizationContext();

  const [leases, setLeases] = useState<LeaseResponse[]>([]);
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
    leases.length > 0 && leases.every((l) => selectedIds.includes(l._id));

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

        const params: LeaseQueryParams = {
          page,
          limit: 12,
          search: search || undefined,
          status: statusValue !== "all" ? (statusValue as LeaseStatus) : undefined,
          deletedFrom: from ? from.toISOString().slice(0, 10) : undefined,
          deletedTo: to ? to.toISOString().slice(0, 10) : undefined,
          sortBy: "updatedAt",
          sortOrder: "desc",
          deleted: true,
        };

        const response = await leaseService.getLeases(params);
        setLeases(response.data);
        setPagination({
          page: response.pagination.page,
          limit: response.pagination.limit,
          total: response.pagination.total,
          pages: response.pagination.pages,
        });
        // Filters just changed the result set — stale selections from the
        // previous page would otherwise "restore" rows nobody can see anymore.
        setSelectedIds([]);

        const term = (search || "").trim();
        const filtersApplied =
          Boolean(term) || statusValue !== "all" || Boolean(from) || Boolean(to);
        if (response.pagination.total === 0) {
          const key = filtersApplied
            ? `${term}|${statusValue}|${from?.getTime() ?? ""}|${to?.getTime() ?? ""}`
            : "__no-search__";
          if (lastEmptyRef.current !== key) {
            lastEmptyRef.current = key;
            showSimpleInfo(
              filtersApplied ? "No deleted leases found" : "No deleted leases",
              filtersApplied
                ? "No deleted leases match these filters."
                : "Nothing has been deleted yet."
            );
          }
        } else {
          lastEmptyRef.current = null;
        }
      } catch (error) {
        showSimpleError(
          "Load failed",
          error instanceof Error ? error.message : "Could not load lease history"
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
      router.replace("/dashboard/leases/my-leases");
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

  const handleRestore = async (lease: LeaseResponse) => {
    try {
      setRestoringId(lease._id);
      await leaseService.restoreLease(lease._id);
      showSimpleSuccess(
        "Lease restored",
        "It has been returned to the active list."
      );
      // Drop it from the history view it was just restored out of.
      setLeases((prev) => prev.filter((l) => l._id !== lease._id));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setSelectedIds((prev) => prev.filter((id) => id !== lease._id));
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
    const results = await Promise.allSettled(
      ids.map((id) => leaseService.restoreLease(id))
    );
    setBulkRestoring(false);

    const restoredIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const failedCount = results.length - restoredIds.length;

    if (restoredIds.length > 0) {
      setLeases((prev) => prev.filter((l) => !restoredIds.includes(l._id)));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - restoredIds.length),
      }));
      setSelectedIds((prev) => prev.filter((id) => !restoredIds.includes(id)));
    }

    if (failedCount === 0) {
      showSimpleSuccess(
        restoredIds.length === 1 ? "Lease restored" : "Leases restored",
        `${restoredIds.length} lease${
          restoredIds.length === 1 ? "" : "s"
        } returned to the active list.`
      );
    } else if (restoredIds.length === 0) {
      showSimpleError(
        "Restore failed",
        `Could not restore ${failedCount === 1 ? "that lease" : `any of the ${failedCount} selected leases`}.`
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
        const pageIds = leases.map((l) => l._id);
        return [...new Set([...prev, ...pageIds])];
      }
      const pageIds = new Set(leases.map((l) => l._id));
      return prev.filter((id) => !pageIds.has(id));
    });
  };

  if (session?.user?.role === UserRole.TENANT) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">

          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <History className="h-7 w-7" />
              Lease History
            </h1>
            <p className="text-muted-foreground">
              Deleted leases, kept for reference. Restore one to return it to
              the active list.
            </p>
            {/* {pagination.total > 0 && (
              <Badge variant="secondary" className="text-sm">
                {pagination.total} deleted
              </Badge>
            )} */}
          </div>

        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/leases")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Leases
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <GlobalSearch
              placeholder="Search deleted leases by property, tenant or unit"
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
                {Object.values(LeaseStatus).map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value.replace("_", " ")}
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
          ) : leases.length === 0 ? (
            <div className="text-center py-16">
              <FileX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No deleted leases</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? "No deleted leases match these filters."
                  : "Deleted leases will appear here."}
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
                        aria-label="Select all deleted leases on this page"
                      />
                    </TableHead>
                    {/* propertyUnit, not property — the latter key does not
                        exist, so the header rendered as the literal
                        "leases.table.property". */}
                    <TableHead>{t("leases.table.propertyUnit")}</TableHead>
                    <TableHead>{t("leases.table.tenant")}</TableHead>
                    <TableHead>{t("leases.table.status")}</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead className="text-right">
                      {t("leases.table.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leases.map((lease) => (
                    <TableRow key={lease._id} className="opacity-90">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(lease._id)}
                          onCheckedChange={(checked) =>
                            toggleRow(lease._id, checked === true)
                          }
                          disabled={
                            restoringId === lease._id ||
                            (bulkRestoring && selectedIds.includes(lease._id))
                          }
                          aria-label={`Select lease at ${
                            lease.propertyId?.name || "unknown property"
                          }`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {lease.propertyId?.name || "—"}
                        </div>
                        {lease.unit?.unitNumber && (
                          <div className="text-xs text-muted-foreground">
                            Unit {lease.unit.unitNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {[
                            lease.tenantId?.firstName,
                            lease.tenantId?.lastName,
                          ]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lease.tenantId?.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <LeaseStatusBadge status={lease.status} />
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          lease.terms?.rentAmount ??
                          lease.terms?.totalAmount ??
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lease.deletedAt ? formatDate(lease.deletedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={
                                restoringId === lease._id ||
                                (bulkRestoring && selectedIds.includes(lease._id))
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRestore(lease)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Restore Lease
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                // deleted=true, or the detail lookup can't see
                                // past the soft-delete hook and 404s.
                                router.push(
                                  `/dashboard/leases/${lease._id}?deleted=true`
                                )
                              }
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {t("leases.actions.viewDetails")}
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
