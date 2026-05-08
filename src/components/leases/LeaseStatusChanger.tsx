/**
 * PropertyPro - Lease Status Changer Component
 * Allow changing lease status with proper validation
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
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { LeaseStatus } from "@/types";
import { leaseService, LeaseResponse } from "@/lib/services/lease.service";
import {
  getNextPossibleStatuses,
  canEditLease,
  canSignLease,
  canTerminateLease,
  canRenewLease,
} from "@/components/leases/LeaseStatusBadge";

interface LeaseStatusChangerProps {
  lease: LeaseResponse;
  onUpdate: () => void;
  disabled?: boolean;
}

export function LeaseStatusChanger({
  lease,
  onUpdate,
  disabled = false,
}: LeaseStatusChangerProps) {
  const [selectedStatus, setSelectedStatus] = useState<LeaseStatus | "">("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const possibleStatuses = getNextPossibleStatuses(lease.status);

  const getStatusChangeMessage = (newStatus: LeaseStatus) => {
    switch (newStatus) {
      case LeaseStatus.PENDING:
        return "This will mark the lease as pending signature. The tenant will be notified to sign the lease.";
      case LeaseStatus.ACTIVE:
        return "This will activate the lease. The tenant will be able to access the property and rent payments will begin.";
      case LeaseStatus.EXPIRED:
        return "This will mark the lease as expired. The tenant will need to renew or vacate the property.";
      case LeaseStatus.TERMINATED:
        return "This will terminate the lease immediately. This action should only be used in special circumstances.";
      case LeaseStatus.DRAFT:
        return "This will revert the lease back to draft status, allowing further edits.";
      default:
        return "This will change the lease status.";
    }
  };

  const getStatusChangeWarning = (newStatus: LeaseStatus) => {
    switch (newStatus) {
      case LeaseStatus.ACTIVE:
        if (!lease.signedDate) {
          return "Warning: This lease has not been signed yet. Consider sending it for signature first.";
        }
        break;
      case LeaseStatus.TERMINATED:
        return "Warning: This will immediately terminate the lease. Consider using the proper termination process instead.";
      case LeaseStatus.EXPIRED:
        return "Warning: This will mark the lease as expired. Make sure the lease period has actually ended.";
    }
    return null;
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus && newStatus !== lease.status) {
      setSelectedStatus(newStatus as LeaseStatus);
      setShowConfirmDialog(true);
    }
  };

  const confirmStatusChange = async () => {
    if (!selectedStatus) return;

    try {
      setIsUpdating(true);
      await leaseService.changeLeaseStatus(lease._id, selectedStatus);

      toast.success("Lease status updated successfully!", {
        description: `Status changed to ${selectedStatus}`,
        duration: 5000,
      });

      setShowConfirmDialog(false);
      setSelectedStatus("");
      onUpdate();
    } catch (error) {
      console.error("Error updating lease status:", error);
      toast.error("Failed to update lease status", {
        description:
          error instanceof Error ? error.message : "An error occurred",
        duration: 5000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusIcon = (status: LeaseStatus) => {
    switch (status) {
      case LeaseStatus.ACTIVE:
        return (
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        );
      case LeaseStatus.TERMINATED:
      case LeaseStatus.EXPIRED:
        return (
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        );
      default:
        return <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getStatusDescription = (status: LeaseStatus) => {
    switch (status) {
      case LeaseStatus.DRAFT:
        return "Lease is being prepared and can be edited";
      case LeaseStatus.PENDING:
        return "Waiting for tenant signature";
      case LeaseStatus.ACTIVE:
        return "Lease is active and in effect";
      case LeaseStatus.EXPIRED:
        return "Lease term has ended";
      case LeaseStatus.TERMINATED:
        return "Lease has been terminated early";
      default:
        return "";
    }
  };

  if (possibleStatuses.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Status:</Label>
        <Badge variant="outline" className="flex items-center gap-1">
          {getStatusIcon(lease.status)}
          {lease.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          (No status changes available)
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
          <SelectTrigger id="status-select" className="w-48">
            <SelectValue placeholder={`Current: ${lease.status}`} />
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
              Change Lease Status
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div>
                You are about to change the lease status from{" "}
                <Badge variant="outline" className="mx-1">
                  {lease.status}
                </Badge>
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
                <div className="flex items-start gap-2 p-3 rounded-md border bg-warning/10 dark:bg-warning/15 border-warning/20">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-warning">
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
                selectedStatus === LeaseStatus.TERMINATED ||
                selectedStatus === LeaseStatus.EXPIRED
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

// Helper component for displaying lease capabilities
interface LeaseCapabilitiesProps {
  lease: LeaseResponse;
}

export function LeaseCapabilities({ lease }: LeaseCapabilitiesProps) {
  const capabilities = [
    { label: "Can Edit", value: canEditLease(lease.status), icon: "✏️" },
    { label: "Can Sign", value: canSignLease(lease.status), icon: "✍️" },
    {
      label: "Can Terminate",
      value: canTerminateLease(lease.status),
      icon: "❌",
    },
    { label: "Can Renew", value: canRenewLease(lease.status), icon: "🔄" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {capabilities.map((capability) => (
        <div
          key={capability.label}
          className={`flex items-center gap-2 p-2 rounded-md text-sm border transition-colors ${
            capability.value
              ? "bg-success/10 dark:bg-success/15 text-success border-success/20"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          <span>{capability.icon}</span>
          <span>{capability.label}</span>
          <span
            className={
              capability.value
                ? "ml-auto text-success"
                : "ml-auto text-destructive"
            }
          >
            {capability.value ? "✓" : "✗"}
          </span>
        </div>
      ))}
    </div>
  );
}
