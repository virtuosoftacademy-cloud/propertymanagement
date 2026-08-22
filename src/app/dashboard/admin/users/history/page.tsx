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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ArrowLeft,
  Eye,
  UserX,
  MoreHorizontal,
  RotateCcw,
  History,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  showSimpleError,
  showSimpleSuccess,
  showSimpleInfo,
} from "@/lib/toast-notifications";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { UserRole } from "@/types";
import {
  userService,
  UserResponse,
  DeletionImpactResponse,
} from "@/lib/services/user.service";

/**
 * User history — soft-deleted users only.
 *
 * The normal list can never show these: the User model's `pre(/^find/)` hook
 * excludes `deletedAt` records unless a query names that field, which the API
 * does only when `deleted=true`.
 *
 * Unlike lease history this page also offers permanent deletion, so it fetches
 * the deletion impact first and keeps the confirm disabled until it clears —
 * the user document is referenced by ~40 other models, and the admin should see
 * what would be stranded before committing to something irreversible.
 */
export default function UserHistoryPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { formatDate } = useLocalizationContext();

  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0,
  });

  // Filters. Role is fetched from /api/roles so a custom role shows up here
  // the same as the two built-ins; the date range is who was deleted WHEN,
  // which the search box has no way to express.
  const [roleFilter, setRoleFilter] = useState("all");
  const [deletedFrom, setDeletedFrom] = useState<Date | undefined>();
  const [deletedTo, setDeletedTo] = useState<Date | undefined>();
  const [availableRoles, setAvailableRoles] = useState<
    { name: string; label: string }[]
  >([]);

  const hasActiveFilters =
    Boolean(searchTerm) ||
    roleFilter !== "all" ||
    Boolean(deletedFrom) ||
    Boolean(deletedTo);

  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setDeletedFrom(undefined);
    setDeletedTo(undefined);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Row selection, for the bulk restore below the table.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const allOnPageSelected =
    users.length > 0 && users.every((u) => selectedIds.includes(u._id));

  const displayName = (u: UserResponse) =>
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;

  const [purgeTarget, setPurgeTarget] = useState<UserResponse | null>(null);
  const [impact, setImpact] = useState<DeletionImpactResponse | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [purging, setPurging] = useState(false);

  // Bulk permanent delete. Each selected user gets its OWN impact check before
  // anything is removed — the same gate the single-delete flow uses, applied
  // per row rather than skipped for the batch. A user with blocking references
  // is left in the list even if it was checked; only the ones that clear the
  // check are ever deleted.
  interface BulkImpactEntry {
    id: string;
    user: UserResponse;
    impact: DeletionImpactResponse | null;
    error?: string;
  }
  const [bulkPurgeIds, setBulkPurgeIds] = useState<string[]>([]);
  const [bulkImpacts, setBulkImpacts] = useState<BulkImpactEntry[]>([]);
  const [bulkImpactLoading, setBulkImpactLoading] = useState(false);
  const [bulkPurging, setBulkPurging] = useState(false);
  const bulkPurgeOpen = bulkPurgeIds.length > 0;
  const deletableBulk = bulkImpacts.filter((e) => e.impact?.canDeletePermanently);
  const blockedBulk = bulkImpacts.filter(
    (e) => e.impact && !e.impact.canDeletePermanently
  );
  const erroredBulk = bulkImpacts.filter((e) => e.error);

  // Fires once per distinct empty result rather than on every refetch.
  const lastEmptyRef = useRef<string | null>(null);

  const fetchHistory = useCallback(
    async (
      page: number,
      search: string,
      role: string,
      from?: Date,
      to?: Date
    ) => {
      try {
        setLoading(true);

        const response = await userService.getDeletedUsers({
          page,
          limit: 12,
          search: search || undefined,
          role: role !== "all" ? (role as UserRole) : undefined,
          deletedFrom: from ? from.toISOString().slice(0, 10) : undefined,
          deletedTo: to ? to.toISOString().slice(0, 10) : undefined,
          sortBy: "updatedAt",
          sortOrder: "desc",
        });

        setUsers(response.data);
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
          Boolean(term) || role !== "all" || Boolean(from) || Boolean(to);
        if (response.pagination.total === 0) {
          const key = filtersApplied
            ? `${term}|${role}|${from?.getTime() ?? ""}|${to?.getTime() ?? ""}`
            : "__no-search__";
          if (lastEmptyRef.current !== key) {
            lastEmptyRef.current = key;
            showSimpleInfo(
              filtersApplied ? "No deleted users found" : "No deleted users",
              filtersApplied
                ? "No deleted users match these filters."
                : "Nothing has been deleted yet."
            );
          }
        } else {
          lastEmptyRef.current = null;
        }
      } catch (error) {
        showSimpleError(
          "Load failed",
          error instanceof Error ? error.message : "Could not load user history"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Only admins manage the deletion log.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== UserRole.ADMIN) {
      router.replace("/dashboard");
    }
  }, [status, session?.user?.role, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.role !== UserRole.ADMIN) return;
    fetchHistory(pagination.page, searchTerm, roleFilter, deletedFrom, deletedTo);
  }, [
    status,
    session?.user?.role,
    pagination.page,
    searchTerm,
    roleFilter,
    deletedFrom,
    deletedTo,
    fetchHistory,
  ]);

  // Roles for the filter dropdown — same source and shape as the main users
  // list, so a custom role appears identically in both places.
  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== UserRole.ADMIN) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/roles?includeSystem=true");
        if (!res.ok) return;
        const data = await res.json();
        const rolesRaw = data?.data?.roles ?? data?.roles ?? [];
        const mapped = rolesRaw
          .filter((r: any) => r?.isActive)
          .map((r: any) => ({ name: r.name, label: r.label || r.name }));
        if (!cancelled) setAvailableRoles(mapped);
      } catch {
        // Non-fatal: the role filter just offers fewer options.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.role]);

  const handleRestore = async (user: UserResponse) => {
    try {
      setRestoringId(user._id);
      await userService.restoreUser(user._id);
      showSimpleSuccess(
        "User restored",
        "They have been returned to the active list."
      );
      // Drop it from the history view it was just restored out of.
      setUsers((prev) => prev.filter((u) => u._id !== user._id));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setSelectedIds((prev) => prev.filter((id) => id !== user._id));
    } catch (error) {
      showSimpleError(
        "Restore failed",
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setRestoringId(null);
    }
  };

  /**
   * Bulk restore only. There is deliberately no bulk permanent-delete: a
   * single delete is gated behind fetching that user's deletion impact and
   * disabling the confirm button until it clears — the user document is
   * referenced by ~40 other models, and skipping that check for a batch would
   * strand records the single-user flow exists specifically to catch.
   */
  const handleBulkRestore = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setBulkRestoring(true);
    const results = await Promise.allSettled(
      ids.map((id) => userService.restoreUser(id))
    );
    setBulkRestoring(false);

    const restoredIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const failedCount = results.length - restoredIds.length;

    if (restoredIds.length > 0) {
      setUsers((prev) => prev.filter((u) => !restoredIds.includes(u._id)));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - restoredIds.length),
      }));
      setSelectedIds((prev) => prev.filter((id) => !restoredIds.includes(id)));
    }

    if (failedCount === 0) {
      showSimpleSuccess(
        restoredIds.length === 1 ? "User restored" : "Users restored",
        `${restoredIds.length} account${
          restoredIds.length === 1 ? "" : "s"
        } returned to the active list.`
      );
    } else if (restoredIds.length === 0) {
      showSimpleError(
        "Restore failed",
        `Could not restore ${failedCount === 1 ? "that user" : `any of the ${failedCount} selected users`}.`
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
        const pageIds = users.map((u) => u._id);
        return [...new Set([...prev, ...pageIds])];
      }
      const pageIds = new Set(users.map((u) => u._id));
      return prev.filter((id) => !pageIds.has(id));
    });
  };

  const openPurgeDialog = async (user: UserResponse) => {
    setPurgeTarget(user);
    setImpact(null);
    setImpactLoading(true);
    try {
      setImpact(await userService.getDeletionImpact(user._id));
    } catch (error) {
      showSimpleError(
        "Could not check impact",
        error instanceof Error ? error.message : "An error occurred"
      );
      setPurgeTarget(null);
    } finally {
      setImpactLoading(false);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    const id = purgeTarget._id;
    try {
      setPurging(true);
      await userService.permanentlyDeleteUser(id);
      showSimpleSuccess(
        "User permanently deleted",
        "The record has been removed for good."
      );
      setUsers((prev) => prev.filter((u) => u._id !== id));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      setPurgeTarget(null);
      setImpact(null);
    } catch (error) {
      showSimpleError(
        "Delete failed",
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setPurging(false);
    }
  };

  const openBulkPurgeDialog = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    // Snapshot the selected rows now: the user list can change under the
    // dialog (a filter, a page change) while impact checks are in flight, and
    // the dialog should keep reasoning about what was selected when it opened.
    const targets = ids
      .map((id) => users.find((u) => u._id === id))
      .filter((u): u is UserResponse => Boolean(u));

    setBulkPurgeIds(ids);
    setBulkImpacts([]);
    setBulkImpactLoading(true);

    const results = await Promise.allSettled(
      targets.map((u) => userService.getDeletionImpact(u._id))
    );

    setBulkImpacts(
      targets.map((u, i) => {
        const result = results[i];
        return {
          id: u._id,
          user: u,
          impact: result.status === "fulfilled" ? result.value : null,
          error:
            result.status === "rejected"
              ? result.reason instanceof Error
                ? result.reason.message
                : "Could not check impact"
              : undefined,
        };
      })
    );
    setBulkImpactLoading(false);
  };

  const closeBulkPurgeDialog = () => {
    if (bulkPurging) return;
    setBulkPurgeIds([]);
    setBulkImpacts([]);
  };

  const handleBulkPurge = async () => {
    const deletable = deletableBulk;
    if (deletable.length === 0) return;

    setBulkPurging(true);
    const results = await Promise.allSettled(
      deletable.map((e) => userService.permanentlyDeleteUser(e.id))
    );
    setBulkPurging(false);

    const deletedIds = deletable
      .filter((_, i) => results[i].status === "fulfilled")
      .map((e) => e.id);
    const failedCount = deletable.length - deletedIds.length;
    const skippedCount = bulkImpacts.length - deletable.length;

    if (deletedIds.length > 0) {
      setUsers((prev) => prev.filter((u) => !deletedIds.includes(u._id)));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - deletedIds.length),
      }));
      setSelectedIds((prev) => prev.filter((id) => !deletedIds.includes(id)));
    }

    if (failedCount === 0) {
      showSimpleSuccess(
        deletedIds.length === 1
          ? "User permanently deleted"
          : "Users permanently deleted",
        skippedCount > 0
          ? `${deletedIds.length} removed for good. ${skippedCount} left in the list — still referenced by other records.`
          : `${deletedIds.length} record${
              deletedIds.length === 1 ? "" : "s"
            } removed for good.`
      );
    } else if (deletedIds.length === 0) {
      showSimpleError(
        "Delete failed",
        `Could not delete ${
          failedCount === 1 ? "that user" : `any of the ${failedCount} eligible users`
        }.`
      );
    } else {
      showSimpleInfo(
        "Partially deleted",
        `${deletedIds.length} deleted, ${failedCount} failed.`
      );
    }

    setBulkPurgeIds([]);
    setBulkImpacts([]);
  };

  if (session?.user?.role !== UserRole.ADMIN) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <History className="h-7 w-7" />
              User History
            </h1>
            <p className="text-muted-foreground">
              Deleted users, kept for reference. Restore one to return it to the
              active list, or remove it permanently.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/admin/users")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <GlobalSearch
              placeholder="Search deleted users by name or email"
              initialValue={searchTerm}
              onSearch={(value) => {
                setSearchTerm(value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              isLoading={loading}
              className="flex-1"
            />

            <Select
              value={roleFilter}
              onValueChange={(value) => {
                setRoleFilter(value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            >
              <SelectTrigger className="h-10 w-full sm:w-[160px]">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {availableRoles.map((role) => (
                  <SelectItem key={role.name} value={role.name}>
                    {role.label}
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
              disabled={(date) =>
                deletedFrom ? date < deletedFrom : false
              }
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
          ) : users.length === 0 ? (
            <div className="text-center py-16">
              <UserX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No deleted users</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? "No deleted users match these filters."
                  : "Deleted users will appear here."}
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
                      disabled={bulkRestoring || bulkPurging}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleBulkRestore}
                      disabled={bulkRestoring || bulkPurging}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {bulkRestoring
                        ? "Restoring…"
                        : `Restore ${selectedIds.length}`}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={openBulkPurgeDialog}
                      disabled={bulkRestoring || bulkPurging}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete {selectedIds.length}
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
                        aria-label="Select all deleted users on this page"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const busy =
                      restoringId === user._id ||
                      (purging && purgeTarget?._id === user._id) ||
                      ((bulkRestoring || bulkPurging) &&
                        selectedIds.includes(user._id));
                    return (
                      <TableRow key={user._id} className="opacity-90">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(user._id)}
                            onCheckedChange={(checked) =>
                              toggleRow(user._id, checked === true)
                            }
                            disabled={busy}
                            aria-label={`Select ${displayName(user)}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {displayName(user)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {String(user.role).replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.deletedAt
                            ? formatDate(user.deletedAt)
                            : user.updatedAt
                            ? formatDate(user.updatedAt)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                disabled={busy}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleRestore(user)}
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Restore User
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  // deleted=true, or the detail lookup can't see
                                  // past the soft-delete hook and 404s.
                                  router.push(
                                    `/dashboard/admin/users/${user._id}?deleted=true`
                                  )
                                }
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => openPurgeDialog(user)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* Permanent delete — impact shown before the action is allowed */}
      <AlertDialog
        open={!!purgeTarget}
        onOpenChange={(open) => {
          if (!open && !purging) {
            setPurgeTarget(null);
            setImpact(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Permanently delete {purgeTarget ? displayName(purgeTarget) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {impactLoading ? (
                  <p>Checking what this would affect…</p>
                ) : impact ? (
                  impact.hasReferences ? (
                    <>
                      <p className="text-red-600 font-medium">
                        This user cannot be deleted permanently —{" "}
                        {impact.blockingTotal} record(s) still reference them:
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        {impact.entries
                          .filter((e) => e.blocking)
                          .map((e) => (
                            <li key={e.label}>
                              <span className="font-medium">{e.count}</span>{" "}
                              {e.label.toLowerCase()}
                              {e.critical && (
                                <span className="text-red-600">
                                  {" "}
                                  — financial history
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                      <p>
                        Reassign or remove these records first. The user stays in
                        this list and can still be restored.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Nothing blocking references this user, so deleting them
                        will not strand any records.{" "}
                        <span className="font-medium">
                          This cannot be undone.
                        </span>
                      </p>
                      {impact.entries.some((e) => !e.blocking) && (
                        <p className="text-muted-foreground">
                          {impact.entries
                            .filter((e) => !e.blocking)
                            .map((e) => `${e.count} ${e.label.toLowerCase()}`)
                            .join(", ")}{" "}
                          will remain as a historical record — audit entries are
                          kept deliberately and do not prevent deletion.
                        </p>
                      )}
                    </>
                  )
                ) : (
                  <p>Could not determine the impact.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog mounted until the request settles.
                e.preventDefault();
                handlePurge();
              }}
              disabled={
                impactLoading || !impact?.canDeletePermanently || purging
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {purging ? "Deleting…" : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk permanent delete — each row still gets its own impact check;
          only the ones that clear it are offered for deletion. */}
      <AlertDialog
        open={bulkPurgeOpen}
        onOpenChange={(open) => {
          if (!open) closeBulkPurgeDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Permanently delete {bulkPurgeIds.length} selected user
              {bulkPurgeIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {bulkImpactLoading ? (
                  <p>Checking what each of these would affect…</p>
                ) : (
                  <>
                    {deletableBulk.length > 0 && (
                      <p>
                        <span className="font-medium text-red-600">
                          {deletableBulk.length} of {bulkImpacts.length}
                        </span>{" "}
                        can be deleted permanently — nothing blocks them.{" "}
                        <span className="font-medium">
                          This cannot be undone.
                        </span>
                      </p>
                    )}

                    {blockedBulk.length > 0 && (
                      <>
                        <p className="text-red-600 font-medium">
                          {blockedBulk.length} cannot be deleted — still
                          referenced by other records, and will stay in this
                          list:
                        </p>
                        <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                          {blockedBulk.map((e) => (
                            <li key={e.id}>
                              <span className="font-medium">
                                {displayName(e.user)}
                              </span>{" "}
                              — {e.impact!.blockingTotal} record(s)
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {erroredBulk.length > 0 && (
                      <p className="text-muted-foreground">
                        Could not check {erroredBulk.length}{" "}
                        {erroredBulk.length === 1 ? "user" : "users"} —
                        skipped rather than guessed at.
                      </p>
                    )}

                    {deletableBulk.length === 0 && (
                      <p className="text-muted-foreground">
                        Nothing here can be deleted yet. Reassign or remove
                        the blocking records first, then try again.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPurging}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBulkPurge();
              }}
              disabled={
                bulkImpactLoading || deletableBulk.length === 0 || bulkPurging
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkPurging
                ? "Deleting…"
                : `Delete ${deletableBulk.length || ""}`.trim()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
