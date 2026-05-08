/**
 * PropertyPro - Compliance Status Changer Component
 * Allow changing compliance report status with proper validation
 */

"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Info, Ban } from "lucide-react";
import { ComplianceStatus } from "@/types"; // Adjust import according to your types

interface ComplianceStatusChangerProps {
  report: {
    _id: string;
    status: ComplianceStatus;
    complianceType: string;
  };
  onUpdate: () => void;
  disabled?: boolean;
}

export function ComplianceStatusChanger({
  report,
  onUpdate,
  disabled = false,
}: ComplianceStatusChangerProps) {
  const [selectedStatus, setSelectedStatus] = useState<ComplianceStatus | "">("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Define possible next statuses based on current status
  const getNextPossibleStatuses = (currentStatus: ComplianceStatus): ComplianceStatus[] => {
    switch (currentStatus) {
      case "pending":
        return ["active"];
      case "active":
        return ["expired", "revoked"];
      case "expired":
        return ["active"]; // allow reactivation
      case "revoked":
        return ["active"]; // rare, but possible
      default:
        return [];
    }
  };

  const possibleStatuses = getNextPossibleStatuses(report.status);

  const getStatusChangeMessage = (newStatus: ComplianceStatus) => {
    switch (newStatus) {
      case "active":
        return "This will mark the compliance certificate as active/valid. The property will be considered compliant.";
      case "expired":
        return "This will mark the certificate as expired. The property may no longer be considered compliant until renewed.";
      case "revoked":
        return "This will revoke the certificate. This is a serious action usually due to violations or failed inspections.";
      case "pending":
        return "This will move the report back to pending status for further review.";
      default:
        return "This will change the compliance report status.";
    }
  };

  const getStatusChangeWarning = (newStatus: ComplianceStatus) => {
    switch (newStatus) {
      case "revoked":
        return "Warning: Revoking a certificate is irreversible in most cases and may have legal implications.";
      case "expired":
        return "Warning: This will immediately mark the certificate as expired. Make sure this is correct.";
      case "active":
        if (report.status === "revoked") {
          return "Warning: Reactivating a previously revoked certificate should only be done after proper review.";
        }
        break;
    }
    return null;
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus && newStatus !== report.status) {
      setSelectedStatus(newStatus as ComplianceStatus);
      setShowConfirmDialog(true);
    }
  };

  const confirmStatusChange = async () => {
    if (!selectedStatus) return;

    try {
      setIsUpdating(true);

      const response = await fetch(`/api/compliance/${report._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "changeStatus",
          status: selectedStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update status");
      }

      toast.success("Compliance status updated successfully!", {
        description: `Status changed to ${selectedStatus}`,
      });

      setShowConfirmDialog(false);
      setSelectedStatus("");
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to update compliance status", {
        description: error?.message || "An error occurred",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusIcon = (status: ComplianceStatus) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case "expired":
      case "revoked":
        return <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      case "pending":
        return <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusDescription = (status: ComplianceStatus) => {
    switch (status) {
      case "pending":
        return "Waiting for review or approval";
      case "active":
        return "Certificate is currently valid";
      case "expired":
        return "Certificate has expired";
      case "revoked":
        return "Certificate has been officially revoked";
      default:
        return "";
    }
  };

  if (possibleStatuses.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Status:</Label>
        <Badge variant="outline" className="flex items-center gap-1">
          {getStatusIcon(report.status)}
          {report.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          (No further status changes available)
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Label htmlFor="status-select" className="text-sm font-medium">
          Change Status:
        </Label>
        <Select
          value=""
          onValueChange={handleStatusChange}
          disabled={disabled || isUpdating}
        >
          <SelectTrigger id="status-select" className="w-52">
            <SelectValue placeholder={`Current: ${report.status}`} />
          </SelectTrigger>
          <SelectContent>
            {possibleStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                <div className="flex items-center gap-2">
                  {getStatusIcon(status)}
                  <span className="capitalize">{status}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {selectedStatus && getStatusIcon(selectedStatus)}
              Change Compliance Status
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div>
                You are about to change the status from{" "}
                <Badge variant="outline" className="mx-1">
                  {report.status}
                </Badge>{" "}
                to{" "}
                <Badge variant="outline" className="mx-1">
                  {selectedStatus}
                </Badge>
              </div>

              {selectedStatus && (
                <div className="text-sm">
                  <p className="font-medium mb-1">What this means:</p>
                  <p>{getStatusDescription(selectedStatus)}</p>
                </div>
              )}

              {selectedStatus && (
                <div className="text-sm">
                  <p>{getStatusChangeMessage(selectedStatus)}</p>
                </div>
              )}

              {selectedStatus && getStatusChangeWarning(selectedStatus) && (
                <div className="flex items-start gap-2 p-3 rounded-md border bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {getStatusChangeWarning(selectedStatus)}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedStatus("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={isUpdating}
              className={
                selectedStatus === "revoked" || selectedStatus === "expired"
                  ? "bg-red-600 hover:bg-red-700"
                  : ""
              }
            >
              {isUpdating ? "Updating..." : "Change Status"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}