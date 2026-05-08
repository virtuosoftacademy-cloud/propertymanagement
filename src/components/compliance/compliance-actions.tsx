"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, addYears } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDatePicker } from "@/components/ui/date-picker";
import {
  MoreHorizontal,
  Eye,
  Edit,
  RefreshCw,
  Ban,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  UserRole,
  ComplianceStatus,
  ComplianceCategory,
  COMPLIANCE_CATEGORY_LABELS,
} from "@/types";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
interface ComplianceReportShape {
  _id: string;
  status: ComplianceStatus;
  category?: ComplianceCategory | string;
  issueDate?: string;
  expiryDate?: string;
  propertyId?: { name?: string } | null;
}

interface ComplianceActionsProps {
  report: ComplianceReportShape;
  onStatusUpdate?: (reportId: string, newStatus: ComplianceStatus) => void;
  onReportUpdate?: () => void;
}

type ActionId = "view" | "edit" | "renew" | "revoke" | "delete";

interface StatusAction {
  action: ActionId;
  label: string;
  icon: React.ComponentType<any>;
  variant: "default" | "destructive" | "outline" | "secondary";
}

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────
export function ComplianceActions({
  report,
  onStatusUpdate,
  onReportUpdate,
}: ComplianceActionsProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [revokeReason, setRevokeReason] = useState("");
  const [renewIssueDate, setRenewIssueDate] = useState<Date | undefined>(
    new Date()
  );
  const [renewExpiryDate, setRenewExpiryDate] = useState<Date | undefined>(
    addYears(new Date(), 1)
  );
  const [renewNotes, setRenewNotes] = useState("");

  const userRole = session?.user?.role as UserRole | undefined;
  const canManage =
    userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;
  const canHardDelete = userRole === UserRole.ADMIN;

  const isFinalState =
    report.status === ComplianceStatus.REVOKED ||
    report.status === ComplianceStatus.EXPIRED;

  const currentExpiryDate = report.expiryDate
    ? new Date(report.expiryDate)
    : null;

  // ────────────────────────────────────────────────
  // Available actions based on status + permissions
  // ────────────────────────────────────────────────
  const getAvailableActions = (): StatusAction[] => {
    const actions: StatusAction[] = [
      { action: "view", label: "View Details", icon: Eye, variant: "outline" },
    ];

    if (!canManage) return actions;

    if (report.status !== ComplianceStatus.REVOKED) {
      actions.push({
        action: "edit",
        label: "Edit Report",
        icon: Edit,
        variant: "outline",
      });
    }

    if (report.status !== ComplianceStatus.REVOKED) {
      actions.push({
        action: "renew",
        label: "Renew Certificate",
        icon: RefreshCw,
        variant: "default",
      });
    }

    if (
      report.status === ComplianceStatus.ACTIVE ||
      report.status === ComplianceStatus.EXPIRING_SOON
    ) {
      actions.push({
        action: "revoke",
        label: "Revoke Certificate",
        icon: Ban,
        variant: "destructive",
      });
    }

    // Only show delete for final-state records.
    // Active certificates must be revoked first - the API enforces this and
    // showing the option then telling users "you can't" is confusing.
    if (isFinalState) {
      actions.push({
        action: "delete",
        label: "Delete Report",
        icon: Trash2,
        variant: "destructive",
      });
    }

    return actions;
  };

  // ────────────────────────────────────────────────
  // Action handlers
  // ────────────────────────────────────────────────
  // IMPORTANT: defer dialog opening until after the dropdown closes its focus
  // restoration cycle. Without this, Radix focus-traps the dropdown trigger
  // at the same moment the dialog opens, causing the dialog to immediately
  // close. Setting state inside requestAnimationFrame fixes this.
  const openDialog = (setter: (open: boolean) => void) => {
    requestAnimationFrame(() => setter(true));
  };

  const handleActionClick = (action: StatusAction) => {
    switch (action.action) {
      case "view":
        router.push(`/dashboard/compliance/${report._id}`);
        break;
      case "edit":
        router.push(`/dashboard/compliance/${report._id}/edit`);
        break;
      case "renew":
        openDialog(setShowRenewDialog);
        break;
      case "revoke":
        openDialog(setShowRevokeDialog);
        break;
      case "delete":
        openDialog(setShowDeleteDialog);
        break;
    }
  };

  const handleApiCall = async (
    method: "POST" | "DELETE",
    path: string,
    body?: Record<string, any>,
    successMsg = "Updated successfully"
  ) => {
    try {
      setIsLoading(true);
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        throw new Error(
          json.error ||
            json.message ||
            `Request failed with status ${res.status}`
        );
      }

      toast.success(successMsg);

      const newStatus = json.data?.status as ComplianceStatus | undefined;
      if (newStatus && onStatusUpdate) {
        onStatusUpdate(report._id, newStatus);
      }
      onReportUpdate?.();
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeReason.trim()) {
      toast.error("Please provide a reason for revocation");
      return;
    }
    const ok = await handleApiCall(
      "POST",
      `/api/compliance/${report._id}/revoke`,
      { reason: revokeReason.trim() },
      "Compliance report revoked"
    );
    if (ok) {
      setShowRevokeDialog(false);
      setRevokeReason("");
    }
  };

  const handleRenew = async () => {
    if (!renewIssueDate || !renewExpiryDate) {
      toast.error("Both issue date and expiry date are required");
      return;
    }
    if (renewExpiryDate <= renewIssueDate) {
      toast.error("Expiry date must be after issue date");
      return;
    }
    if (renewIssueDate > new Date()) {
      toast.error("Issue date cannot be in the future");
      return;
    }
    if (currentExpiryDate && renewExpiryDate <= currentExpiryDate) {
      toast.error(
        "New expiry date must be later than the current expiry date"
      );
      return;
    }
    const ok = await handleApiCall(
      "POST",
      `/api/compliance/${report._id}/renew`,
      {
        issueDate: format(renewIssueDate, "yyyy-MM-dd"),
        expiryDate: format(renewExpiryDate, "yyyy-MM-dd"),
        notes: renewNotes.trim() || undefined,
      },
      "Compliance report renewed"
    );
    if (ok) {
      setShowRenewDialog(false);
      setRenewNotes("");
      setRenewIssueDate(new Date());
      setRenewExpiryDate(addYears(new Date(), 1));
    }
  };

  const handleDelete = async (hard: boolean) => {
    const path = hard
      ? `/api/compliance/${report._id}?hard=true`
      : `/api/compliance/${report._id}`;
    const ok = await handleApiCall(
      "DELETE",
      path,
      undefined,
      hard
        ? "Compliance report permanently deleted"
        : "Compliance report deleted"
    );
    if (ok) setShowDeleteDialog(false);
  };

  const availableActions = getAvailableActions();

  // Use the human-readable label, not the slug
  const reportLabel =
    report.propertyId?.name ||
    (report.category &&
      (COMPLIANCE_CATEGORY_LABELS[report.category as ComplianceCategory] ||
        String(report.category).split("-").join(" "))) ||
    "this report";

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={isLoading}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Compliance Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableActions.map((action) => {
            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={action.action}
                onSelect={(e) => {
                  // Prevent default focus restoration so dialogs can open cleanly
                  e.preventDefault();
                  handleActionClick(action);
                }}
                disabled={isLoading}
                className={
                  action.variant === "destructive"
                    ? "text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                    : action.variant === "default"
                    ? "text-blue-600 focus:text-blue-600 focus:bg-blue-50 dark:focus:bg-blue-950/30"
                    : ""
                }
              >
                <Icon className="mr-2 h-4 w-4" />
                {action.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Renew Dialog */}
      <Dialog open={showRenewDialog} onOpenChange={setShowRenewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew Compliance Certificate</DialogTitle>
            <DialogDescription>
              Issue a new validity period for {reportLabel}.
              {currentExpiryDate && (
                <>
                  {" "}
                  Current expiry:{" "}
                  <span className="font-medium">
                    {format(currentExpiryDate, "MMM d, yyyy")}
                  </span>
                  . The new expiry must be later than this.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>New Issue Date</Label>
                <FormDatePicker
                  value={renewIssueDate}
                  onChange={(d) => setRenewIssueDate(d ?? undefined)}
                  placeholder="Select issue date"
                  disabled={(date) => date > new Date()}
                />
              </div>
              <div className="space-y-2">
                <Label>New Expiry Date</Label>
                <FormDatePicker
                  value={renewExpiryDate}
                  onChange={(d) => setRenewExpiryDate(d ?? undefined)}
                  placeholder="Select expiry date"
                  disabled={(date) => {
                    if (renewIssueDate && date <= renewIssueDate) return true;
                    if (currentExpiryDate && date <= currentExpiryDate)
                      return true;
                    return date < new Date();
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="renew-notes">Notes (optional)</Label>
              <Textarea
                id="renew-notes"
                placeholder="Inspection result, certificate number, etc."
                value={renewNotes}
                onChange={(e) => setRenewNotes(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenewDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleRenew} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Renewing...
                </>
              ) : (
                "Renew Certificate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Compliance Certificate</DialogTitle>
            <DialogDescription>
              Provide a reason for revoking {reportLabel}. This action cannot be
              undone — to issue a new certificate, use renew instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="revoke-reason">Reason for Revocation</Label>
              <Textarea
                id="revoke-reason"
                placeholder="Failed inspection, non-compliance, building condemned..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={4}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                {revokeReason.length}/1000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevokeDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={isLoading || !revokeReason.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revoking...
                </>
              ) : (
                "Revoke Certificate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation - only shown for final-state reports */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Compliance Report</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {reportLabel} from your list of compliance
              reports. Soft deletion can be reversed by an admin.
              {canHardDelete &&
                " Permanent deletion cannot be undone and removes all record of this certificate."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // keep dialog open while loading
                handleDelete(false);
              }}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Soft Delete"
              )}
            </AlertDialogAction>
            {canHardDelete && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(true);
                }}
                disabled={isLoading}
                className="bg-red-900 hover:bg-red-950 focus:ring-red-900"
              >
                {isLoading ? "Deleting..." : "Delete Permanently"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}