/**
 * PropertyPro - Individual Maintenance Request API Routes
 * CRUD operations for individual maintenance requests
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
import { maintenanceRequestSchema, validateSchema } from "@/lib/validations";
import { ensureTenantProfile } from "@/lib/tenant-utils";

// ============================================================================
// GET /api/maintenance/[id] - Get a specific maintenance request
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

    // Find the maintenance request
    const maintenanceRequest = await MaintenanceRequest.findById(id)
      .populate(
        "propertyId",
        "name address type ownerId managerId isMultiUnit units"
      )
      .populate("tenantId", "firstName lastName email phone avatar")
      .populate("assignedTo", "firstName lastName email phone avatar");

    if (!maintenanceRequest) {
      return createErrorResponse("Maintenance request not found", 404);
    }

    // Role-based authorization
    if (user.role === UserRole.TENANT) {
      // For tenants, check if they own this maintenance request
      if (!maintenanceRequest.tenantId._id.equals(user.id)) {
        return createErrorResponse(
          "You can only view your own maintenance requests",
          403
        );
      }
    }
    // Single company architecture - Managers can view all maintenance requests

    // Transform the data to match frontend expectations
    const requestObj = maintenanceRequest.toObject
      ? maintenanceRequest.toObject()
      : maintenanceRequest;

    // Find unit information if unitId is present
    let unit = null;
    if (requestObj.unitId && requestObj.propertyId?.units) {
      unit = requestObj.propertyId.units.find(
        (u: any) => u._id.toString() === requestObj.unitId.toString()
      );
    }

    const transformedRequest = {
      ...requestObj,
      property: requestObj.propertyId,
      unit: unit,
      tenant: requestObj.tenantId
        ? {
            user: requestObj.tenantId,
          }
        : null,
    };

    return createSuccessResponse(
      transformedRequest,
      "Maintenance request retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PUT /api/maintenance/[id] - Update a maintenance request
// ============================================================================

export async function PUT(
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

    // Find the maintenance request
    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      return createErrorResponse("Maintenance request not found", 404);
    }

    // Role-based authorization
    if (user.role === UserRole.TENANT) {
      // Tenants can only update their own requests
      const tenant = await ensureTenantProfile(user.id);
      if (!tenant || !maintenanceRequest.tenantId.equals(tenant._id)) {
        return createErrorResponse(
          "You can only update your own maintenance requests",
          403
        );
      }

      // Tenants can only update certain fields and only if not completed
      if (maintenanceRequest.status === MaintenanceStatus.COMPLETED) {
        return createErrorResponse(
          "Cannot update completed maintenance request",
          400
        );
      }
    } else if (user.role === UserRole.MANAGER) {
      // Maintenance staff can only update assigned requests
      if (
        maintenanceRequest.assignedTo &&
        !maintenanceRequest.assignedTo.equals(user.id)
      ) {
        return createErrorResponse(
          "You can only update requests assigned to you",
          403
        );
      }
    }

    // Validate update data (partial schema)
    const updateSchema = maintenanceRequestSchema.partial();
    const validation = validateSchema(updateSchema, body);
    if (!validation.success) {
      return createErrorResponse(validation.errors.join(", "), 400);
    }

    const updateData = validation.data;

    // Prevent certain fields from being updated by tenants
    if (user.role === UserRole.TENANT) {
      const restrictedFields = [
        "assignedTo",
        "status",
        "estimatedCost",
        "actualCost",
        "scheduledDate",
        "completedDate",
      ];
      restrictedFields.forEach((field) => {
        if (field in updateData) {
          delete (updateData as Record<string, unknown>)[field];
        }
      });
    }

    // Prevent maintenance staff from updating certain fields
    if (user.role === UserRole.MANAGER) {
      delete updateData.propertyId;
      delete updateData.tenantId;
      delete updateData.priority; // Only managers can change priority
    }

    // Update the maintenance request
    Object.assign(maintenanceRequest, updateData);
    await maintenanceRequest.save();

    // Populate related information
    await maintenanceRequest.populate([
      { path: "propertyId", select: "name address type" },
      { path: "tenantId", select: "firstName lastName email phone" },
      { path: "assignedTo", select: "firstName lastName email phone" },
    ]);

    // Transform the data to match frontend expectations
    const requestObj = maintenanceRequest.toObject
      ? maintenanceRequest.toObject()
      : maintenanceRequest;
    const transformedRequest = {
      ...requestObj,
      property: requestObj.propertyId,
      tenant: {
        user: requestObj.tenantId || {},
      },
    };

    return createSuccessResponse(
      transformedRequest,
      "Maintenance request updated successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// DELETE /api/maintenance/[id] - Delete a maintenance request (soft delete)
// ============================================================================

export async function DELETE(
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
    const allowedRoles = [UserRole.ADMIN, UserRole.MANAGER];

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return createErrorResponse("Forbidden", 403);
    }

    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid maintenance request ID", 400);
    }

    // Find the maintenance request
    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      return createErrorResponse("Maintenance request not found", 404);
    }

    // Prevent deleting completed requests
    if (maintenanceRequest.status === MaintenanceStatus.COMPLETED) {
      return createErrorResponse(
        "Cannot delete completed maintenance request.",
        409
      );
    }

    // Perform soft delete
    maintenanceRequest.deletedAt = new Date();
    await maintenanceRequest.save();

    return createSuccessResponse(
      { id: maintenanceRequest._id },
      "Maintenance request deleted successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PATCH /api/maintenance/[id] - Partial update (status change, assignment, etc.)
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

    // Find the maintenance request
    const maintenanceRequest = await MaintenanceRequest.findById(id);
    if (!maintenanceRequest) {
      return createErrorResponse("Maintenance request not found", 404);
    }

    // Role-based authorization for tenant actions
    if (user.role === UserRole.TENANT) {
      const tenant = await ensureTenantProfile(user.id);
      if (!tenant || !maintenanceRequest.tenantId.equals(tenant._id)) {
        return createErrorResponse(
          "You can only modify your own maintenance requests",
          403
        );
      }
    }

    // Handle specific patch operations
    const { action, ...data } = body;

    switch (action) {
      case "assign":
        if (user.role === UserRole.TENANT) {
          return createErrorResponse(
            "Tenants cannot assign maintenance requests",
            403
          );
        }
        if (!data.assignedTo) {
          return createErrorResponse("Assigned user ID is required", 400);
        }

        // Verify assigned user exists and has appropriate role
        const assignedUser = await User.findById(data.assignedTo);
        if (!assignedUser) {
          return createErrorResponse("Assigned user not found", 404);
        }

        if (
          ![
            "maintenance_staff",
            "property_manager",
            "manager",
            "super_admin",
            "admin",
            "technician",
          ].includes(assignedUser.role)
        ) {
          return createErrorResponse(
            "User cannot be assigned maintenance requests",
            400
          );
        }

        maintenanceRequest.assignedTo = data.assignedTo;
        maintenanceRequest.status = MaintenanceStatus.ASSIGNED;
        break;

      case "startWork":
        if (user.role === UserRole.TENANT) {
          return createErrorResponse(
            "Tenants cannot start work on maintenance requests",
            403
          );
        }
        maintenanceRequest.status = MaintenanceStatus.IN_PROGRESS;
        break;

      case "complete":
        if (user.role === UserRole.TENANT) {
          return createErrorResponse(
            "Tenants cannot complete maintenance requests",
            403
          );
        }
        maintenanceRequest.status = MaintenanceStatus.COMPLETED;
        maintenanceRequest.completedDate = new Date();
        if (data.actualCost) {
          maintenanceRequest.actualCost = data.actualCost;
        }
        break;

      case "addNote":
        if (!data.note) {
          return createErrorResponse("Note content is required", 400);
        }

        const currentNotes = maintenanceRequest.notes || "";
        const timestamp = new Date().toISOString();
        const userName = `${user.firstName || "User"} ${
          user.lastName || ""
        }`.trim();
        const newNote = `[${timestamp}] ${userName}: ${data.note}`;

        maintenanceRequest.notes = currentNotes
          ? `${currentNotes}\n${newNote}`
          : newNote;
        break;

      default:
        return createErrorResponse("Invalid action specified", 400);
    }

    await maintenanceRequest.save();

    return createSuccessResponse(
      maintenanceRequest,
      `Maintenance request ${action} completed successfully`
    );
  } catch (error) {
    return handleApiError(error);
  }
}
