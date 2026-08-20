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

  const [purgeTarget, setPurgeTarget] = useState<UserResponse | null>(null);
  const [impact, setImpact] = useState<DeletionImpactResponse | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [purging, setPurging] = useState(false);

  // Fires once per distinct empty result rather than on every refetch.
  const lastEmptyRef = useRef<string | null>(null);

  const fetchHistory = useCallback(async (page: number, search: string) => {
    try {
      setLoading(true);

      const response = await userService.getDeletedUsers({
        page,
        limit: 12,
        search: search || undefined,
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

      const term = (search || "").trim();
      if (response.pagination.total === 0) {
        const key = term || "__no-search__";
        if (lastEmptyRef.current !== key) {
          lastEmptyRef.current = key;
          showSimpleInfo(
            term ? "No deleted users found" : "No deleted users",
            term
              ? `No deleted users match "${term}".`
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
  }, []);

  // Only admins manage the deletion log.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== UserRole.ADMIN) {
      router.replace("/dashboard");
    }
  }, [status, session?.user?.role, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.role !== UserRole.ADMIN) return;
    fetchHistory(pagination.page, searchTerm);
  }, [status, session?.user?.role, pagination.page, searchTerm, fetchHistory]);

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
    } catch (error) {
      showSimpleError(
        "Restore failed",
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setRestoringId(null);
    }
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

  if (session?.user?.role !== UserRole.ADMIN) return null;

  const displayName = (u: UserResponse) =>
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;

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
          <GlobalSearch
            placeholder="Search deleted users by name or email"
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
          ) : users.length === 0 ? (
            <div className="text-center py-16">
              <UserX className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No deleted users</h3>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "No deleted users match your search."
                  : "Deleted users will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      (purging && purgeTarget?._id === user._id);
                    return (
                      <TableRow key={user._id} className="opacity-90">
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
    </div>
  );
}
