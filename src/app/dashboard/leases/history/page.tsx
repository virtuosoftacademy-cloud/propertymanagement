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
} from "lucide-react";
import {
  showSimpleError,
  showSimpleSuccess,
  showSimpleInfo,
} from "@/lib/toast-notifications";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { UserRole } from "@/types";
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

  // Fires once per distinct empty result rather than on every refetch.
  const lastEmptyRef = useRef<string | null>(null);

  const fetchHistory = useCallback(
    async (page: number, search: string) => {
      try {
        setLoading(true);

        const params: LeaseQueryParams = {
          page,
          limit: 12,
          search: search || undefined,
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

        const term = (search || "").trim();
        if (response.pagination.total === 0) {
          const key = term || "__no-search__";
          if (lastEmptyRef.current !== key) {
            lastEmptyRef.current = key;
            showSimpleInfo(
              term ? "No deleted leases found" : "No deleted leases",
              term
                ? `No deleted leases match "${term}".`
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
    fetchHistory(pagination.page, searchTerm);
  }, [status, session?.user?.role, pagination.page, searchTerm, fetchHistory]);

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
    } catch (error) {
      showSimpleError(
        "Restore failed",
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setRestoringId(null);
    }
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
          <GlobalSearch
            placeholder="Search deleted leases by property, tenant or unit"
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
          ) : leases.length === 0 ? (
            <div className="text-center py-16">
              <FileX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No deleted leases</h3>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "No deleted leases match your search."
                  : "Deleted leases will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leases.table.property")}</TableHead>
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
                              disabled={restoringId === lease._id}
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
