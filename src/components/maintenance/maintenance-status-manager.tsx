"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoreHorizontal,
  User,
  Play,
  CheckCircle,
  X,
  Eye,
  Edit,
  Trash2,
  Clock,
} from "lucide-react";
import { UserRole, MaintenanceStatus, IMaintenanceRequest } from "@/types";

interface MaintenanceStatusManagerProps {
  request: IMaintenanceRequest;
  onStatusUpdate?: (requestId: string, newStatus: MaintenanceStatus) => void;
  onRequestUpdate?: () => void;
  availableStaff?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
}

interface StatusAction {
  action: string;
  label: string;
  icon: React.ComponentType<any>;
  variant: "default" | "destructive" | "outline" | "secondary";
  requiresConfirmation?: boolean;
  requiresInput?: boolean;
}

export function MaintenanceStatusManager({
  request,
  onStatusUpdate,
  onRequestUpdate,
  availableStaff = [],
}: MaintenanceStatusManagerProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<StatusAction | null>(
    null
  );
  const [selectedStaff, setSelectedStaff] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");

  // Check user permissions
  const userRole = session?.user?.role as UserRole;
  const canManage = [UserRole.ADMIN, UserRole.MANAGER].includes(userRole);
  const canWork = [UserRole.ADMIN, UserRole.MANAGER].includes(userRole);
  const isAssignedToUser = request.assignedTo?.toString() === session?.user?.id;

  // Get available actions based on current status and user permissions
  const getAvailableActions = (): StatusAction[] => {
    const actions: StatusAction[] = [];

    // Add view action for all statuses
    actions.push({
      action: "view",
      label: "View Details",
      icon: Eye,
      variant: "outline",
    });

    // Add edit action for submitted requests and other non-completed statuses
    if (
      request.status !== MaintenanceStatus.COMPLETED &&
      request.status !== MaintenanceStatus.CANCELLED
    ) {
      actions.push({
        action: "edit",
        label: "Edit Request",
        icon: Edit,
        variant: "outline",
      });
    }

    switch (request.status) {
      case MaintenanceStatus.SUBMITTED:
        if (canManage) {
          actions.push({
            action: "assign",
            label: "Assign Technician",
            icon: User,
            variant: "default",
            requiresInput: true,
          });
        }
        break;

      case MaintenanceStatus.ASSIGNED:
        if (canWork && (isAssignedToUser || canManage)) {
          actions.push({
            action: "start",
            label: "Start Work",
            icon: Play,
            variant: "default",
            requiresConfirmation: true,
          });
        }
        if (canManage) {
          actions.push({
            action: "reassign",
            label: "Reassign",
            icon: User,
            variant: "outline",
            requiresInput: true,
          });
        }
        break;

      case MaintenanceStatus.IN_PROGRESS:
        if (canWork && (isAssignedToUser || canManage)) {
          actions.push({
            action: "complete",
            label: "Mark Complete",
            icon: CheckCircle,
            variant: "default",
            requiresInput: true,
          });
        }
        break;

      case MaintenanceStatus.COMPLETED:
        // For completed requests, only view action is available (already added above)
        break;
    }

    // Cancel action (available for most statuses except completed or cancelled)
    if (
      request.status !== MaintenanceStatus.COMPLETED &&
      request.status !== MaintenanceStatus.CANCELLED &&
      canManage
    ) {
      actions.push({
        action: "cancel",
        label: "Cancel Request",
        icon: X,
        variant: "destructive",
        requiresConfirmation: true,
      });
    }

    return actions;
  };

  // Handle status update API call
  const handleStatusUpdate = async (action: string, data: any = {}) => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/maintenance/${request._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...data,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg =
          errorData?.error ||
          (Array.isArray(errorData?.errors)
            ? errorData.errors.join(", ")
            : null) ||
          errorData?.message ||
          "Failed to update status";
        throw new Error(msg);
      }

      const result = await response.json();

      toast.success(`Request ${action} successfully`);

      // Call callbacks to update parent components
      if (onStatusUpdate && result.data?.status) {
        onStatusUpdate(request._id.toString(), result.data.status);
      }
      if (onRequestUpdate) {
        onRequestUpdate();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update status"
      );
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(false);
      setShowAssignDialog(false);
      setShowCompleteDialog(false);
      setSelectedAction(null);
      setSelectedStaff("");
      setActualCost("");
      setCompletionNotes("");
    }
  };

  // Handle action click
  const handleActionClick = (action: StatusAction) => {
    setSelectedAction(action);

    // Handle view action - navigate to maintenance request details page
    if (action.action === "view") {
      router.push(`/dashboard/maintenance/${request._id}`);
      return;
    }

    // Handle edit action - navigate to maintenance request edit page
    if (action.action === "edit") {
      router.push(`/dashboard/maintenance/${request._id}/edit`);
      return;
    }

    if (action.requiresInput) {
      if (action.action === "assign" || action.action === "reassign") {
        setShowAssignDialog(true);
      } else if (action.action === "complete") {
        setShowCompleteDialog(true);
      }
    } else if (action.requiresConfirmation) {
      setShowConfirmDialog(true);
    } else {
      handleStatusUpdate(action.action);
    }
  };

  // Handle assignment
  const handleAssignment = () => {
    if (!selectedStaff) {
      toast.error("Please select a technician");
      return;
    }
    handleStatusUpdate(selectedAction?.action || "assign", {
      assignedTo: selectedStaff,
    });
  };

  // Handle completion
  const handleCompletion = () => {
    const data: any = {};
    if (actualCost) {
      const cost = parseFloat(actualCost);
      if (isNaN(cost) || cost < 0) {
        toast.error("Please enter a valid cost");
        return;
      }
      data.actualCost = cost;
    }
    if (completionNotes) {
      data.notes = completionNotes;
    }
    handleStatusUpdate("complete", data);
  };

  const availableActions = getAvailableActions();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={isLoading}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Show appropriate label based on available actions */}
          {request.status === MaintenanceStatus.COMPLETED ? null : ( // For completed requests, no label needed (just view action)
            <>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}

          {availableActions.map((action) => {
            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={action.action}
                onClick={() => handleActionClick(action)}
                className={
                  action.variant === "destructive"
                    ? "text-red-600 focus:text-red-600"
                    : action.variant === "default"
                    ? "text-blue-600 focus:text-blue-600"
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

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {selectedAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {selectedAction?.label.toLowerCase()}{" "}
              this maintenance request? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusUpdate(selectedAction?.action || "")}
              disabled={isLoading}
              className={
                selectedAction?.variant === "destructive"
                  ? "bg-red-600 hover:bg-red-700"
                  : ""
              }
            >
              {isLoading ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAction?.label}</DialogTitle>
            <DialogDescription>
              Select a technician to assign this maintenance request to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="staff-select">Technician</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a technician" />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((staff) => (
                    <SelectItem key={staff._id} value={staff._id}>
                      {staff.firstName} {staff.lastName} ({staff.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAssignDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignment}
              disabled={isLoading || !selectedStaff}
            >
              {isLoading ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completion Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Maintenance Request</DialogTitle>
            <DialogDescription>
              Mark this maintenance request as completed and provide final
              details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actual-cost">Actual Cost (Optional)</Label>
              <Input
                id="actual-cost"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="completion-notes">
                Completion Notes (Optional)
              </Label>
              <Textarea
                id="completion-notes"
                placeholder="Add any notes about the completed work..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCompleteDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleCompletion} disabled={isLoading}>
              {isLoading ? "Completing..." : "Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
