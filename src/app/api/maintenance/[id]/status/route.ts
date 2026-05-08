/**
 * PropertyPro - Maintenance Request Status Update API
 * Handle status changes for maintenance requests with role-based permissions
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { MaintenanceRequest, User } from "@/models";
import { UserRole, MaintenanceStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  isValidObjectId,
} from "@/lib/api-utils";

// ============================================================================
// PATCH /api/maintenance/[id]/status - Update maintenance request status
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    const allowedRoles = [
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.MANAGER,
      UserRole.TENANT,
    ];

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return createErrorResponse("Forbidden", 403);
    }

    const user = session.user;
    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid maintenance request ID", 400);
    }

    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    const { action, assignedTo, actualCost, notes } = body;

    if (!action) {
      return createErrorResponse("Action is required", 400);
    }

    // Find the maintenance request
    const maintenanceRequest = await MaintenanceRequest.findById(id)
      .populate("assignedTo", "firstName lastName email")
      .populate("tenantId", "firstName lastName email phone avatar")
      .populate("propertyId", "name address");

    if (!maintenanceRequest) {
      return createErrorResponse("Maintenance request not found", 404);
    }

    // Role-based authorization
    const canManage = [UserRole.ADMIN, UserRole.MANAGER].includes(
      user.role as UserRole
    );
    const canWork = [UserRole.ADMIN, UserRole.MANAGER].includes(
      user.role as UserRole
    );
    const isAssignedToUser =
      maintenanceRequest.assignedTo?._id?.toString() === user.id;
    const isRequestOwner =
      user.role === UserRole.TENANT &&
      maintenanceRequest.tenantId?._id?.toString() === user.id;

    // Store old status for synchronization before making changes
    const oldStatus = maintenanceRequest.status;

    // Validate action permissions
    switch (action) {
      case "assign":
      case "reassign":
        if (!canManage) {
          return createErrorResponse(
            "Only managers can assign maintenance requests",
            403
          );
        }
        if (!assignedTo) {
          return createErrorResponse("Assigned user ID is required", 400);
        }
        if (!isValidObjectId(assignedTo)) {
          return createErrorResponse("Invalid assigned user ID", 400);
        }

        // Verify the assigned user exists and has appropriate role
        const assignedUser = await User.findById(assignedTo);
        if (!assignedUser) {
          return createErrorResponse("Assigned user not found", 404);
        }
        if (![UserRole.MANAGER].includes(assignedUser.role as UserRole)) {
          return createErrorResponse("Can only assign to managers", 400);
        }

        maintenanceRequest.assignedTo = assignedTo;
        maintenanceRequest.status = MaintenanceStatus.ASSIGNED;
        break;

      case "start":
        if (!canWork || (!isAssignedToUser && !canManage)) {
          return createErrorResponse(
            "You can only start work on requests assigned to you",
            403
          );
        }
        if (maintenanceRequest.status !== MaintenanceStatus.ASSIGNED) {
          return createErrorResponse(
            "Can only start work on assigned requests",
            400
          );
        }
        maintenanceRequest.status = MaintenanceStatus.IN_PROGRESS;
        break;

      case "complete":
        if (!canWork || (!isAssignedToUser && !canManage)) {
          return createErrorResponse(
            "You can only complete requests assigned to you",
            403
          );
        }
        if (maintenanceRequest.status !== MaintenanceStatus.IN_PROGRESS) {
          return createErrorResponse(
            "Can only complete requests that are in progress",
            400
          );
        }
        maintenanceRequest.status = MaintenanceStatus.COMPLETED;
        maintenanceRequest.completedDate = new Date();

        if (actualCost !== undefined) {
          const cost = parseFloat(actualCost);
          if (isNaN(cost) || cost < 0) {
            return createErrorResponse("Invalid actual cost", 400);
          }
          maintenanceRequest.actualCost = cost;
        }

        if (notes) {
          const timestamp = new Date().toISOString();
          const userName = `${user.firstName || "User"} ${
            user.lastName || ""
          }`.trim();
          const completionNote = `[${timestamp}] ${userName} (Completion): ${notes}`;

          maintenanceRequest.notes = maintenanceRequest.notes
            ? `${maintenanceRequest.notes}\n${completionNote}`
            : completionNote;
        }
        break;

      case "cancel":
        if (!canManage && !isRequestOwner) {
          return createErrorResponse(
            "Only managers or request owners can cancel requests",
            403
          );
        }
        if (maintenanceRequest.status === MaintenanceStatus.COMPLETED) {
          return createErrorResponse("Cannot cancel completed requests", 400);
        }
        maintenanceRequest.status = MaintenanceStatus.CANCELLED;
        break;

      default:
        return createErrorResponse("Invalid action specified", 400);
    }

    // Save the updated request
    await maintenanceRequest.save();

    // Trigger property status synchronization if maintenance affects unit availability
    let syncWarning: string | null = null;
    if (maintenanceRequest.propertyId && maintenanceRequest.unitId) {
      try {
        const { propertyStatusSynchronizer } = await import(
          "@/lib/services/property-status-sync.service"
        );

        await propertyStatusSynchronizer.syncAfterMaintenanceStatusChange(
          maintenanceRequest.propertyId._id.toString(),
          maintenanceRequest._id.toString(),
          maintenanceRequest.unitId.toString(),
          oldStatus,
          maintenanceRequest.status,
          {
            triggeredBy: `maintenance-api:${user.id}`,
            logChanges: true,
          }
        );
      } catch (syncError) {
        syncWarning =
          syncError instanceof Error
            ? syncError.message
            : "Property status synchronization failed";
      }
    }

    // Populate the response data
    const updatedRequest = await MaintenanceRequest.findById(id)
      .populate("propertyId", "name address type")
      .populate("tenantId", "firstName lastName email phone avatar")
      .populate("assignedTo", "firstName lastName email role");

    return createSuccessResponse(
      {
        data: updatedRequest,
        warning: syncWarning || undefined,
      },
      `Maintenance request ${action} completed successfully`
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// GET /api/maintenance/[id]/status - Get status history (future enhancement)
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid maintenance request ID", 400);
    }

    // Find the maintenance request
    const maintenanceRequest = await MaintenanceRequest.findById(id)
      .populate("assignedTo", "firstName lastName email")
      .populate("tenantId", "firstName lastName email phone avatar")
      .populate("propertyId", "name address");

    if (!maintenanceRequest) {
      return createErrorResponse("Maintenance request not found", 404);
    }

    // Create status history from available data
    const statusHistory = [
      {
        status: MaintenanceStatus.SUBMITTED,
        timestamp: maintenanceRequest.createdAt,
        user: "System",
        action: "Request submitted",
      },
    ];

    if (maintenanceRequest.assignedTo) {
      statusHistory.push({
        status: MaintenanceStatus.ASSIGNED,
        timestamp: maintenanceRequest.updatedAt, // This is approximate
        user:
          (maintenanceRequest.assignedTo as any)?.firstName +
          " " +
          (maintenanceRequest.assignedTo as any)?.lastName,
        action: "Request assigned",
      });
    }

    if (maintenanceRequest.status === MaintenanceStatus.IN_PROGRESS) {
      statusHistory.push({
        status: MaintenanceStatus.IN_PROGRESS,
        timestamp: maintenanceRequest.updatedAt,
        user:
          (maintenanceRequest.assignedTo as any)?.firstName +
            " " +
            (maintenanceRequest.assignedTo as any)?.lastName || "Unknown",
        action: "Work started",
      });
    }

    if (
      maintenanceRequest.status === MaintenanceStatus.COMPLETED &&
      maintenanceRequest.completedDate
    ) {
      statusHistory.push({
        status: MaintenanceStatus.COMPLETED,
        timestamp: maintenanceRequest.completedDate,
        user:
          (maintenanceRequest.assignedTo as any)?.firstName +
            " " +
            (maintenanceRequest.assignedTo as any)?.lastName || "Unknown",
        action: "Work completed",
      });
    }

    if (maintenanceRequest.status === MaintenanceStatus.CANCELLED) {
      statusHistory.push({
        status: MaintenanceStatus.CANCELLED,
        timestamp: maintenanceRequest.updatedAt,
        user: "System",
        action: "Request cancelled",
      });
    }

    return createSuccessResponse({
      request: maintenanceRequest,
      statusHistory,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
