/**
 * PropertyPro - Maintenance Requests API Routes
 * CRUD operations for maintenance request management
 */

import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { NextRequest } from "next/server";
import { MaintenanceRequest, Property, User } from "@/models";
import { UserRole, MaintenancePriority, MaintenanceStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parsePaginationParams,
  paginateQuery,
  parseRequestBody,
} from "@/lib/api-utils";
import {
  maintenanceRequestSchema,
  paginationSchema,
  validateSchema,
} from "@/lib/validations";

// ============================================================================
// GET /api/maintenance - Get all maintenance requests with pagination and filtering
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    const allowedRoles = [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT];

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return createErrorResponse("Forbidden", 403);
    }

    const user = session.user;
    const { searchParams } = new URL(request.url);
    const paginationParams = parsePaginationParams(searchParams);

    // Parse filter parameters
    const filterParams = {
      ...paginationParams,
      status: searchParams.get("status") || undefined,
      priority: searchParams.get("priority") || undefined,
      category: searchParams.get("category") || undefined,
      propertyId: searchParams.get("propertyId") || undefined,
      unitId: searchParams.get("unitId") || undefined,
      tenantId: searchParams.get("tenantId") || undefined,
      assignedTo: searchParams.get("assignedTo") || undefined,
      emergency: searchParams.get("emergency") === "true",
      overdue: searchParams.get("overdue") === "true",
    };

    // Validate pagination parameters only
    const validation = validateSchema(paginationSchema, paginationParams);
    if (!validation.success) {
      return createErrorResponse(validation.errors.join(", "), 400);
    }

    // Use the full filter params for filtering
    const filters = filterParams;

    // Build query based on user role and filters
    const query: Record<string, unknown> = {};

    // Role-based filtering
    if (user.role === UserRole.TENANT) {
      // For tenants, show only their own maintenance requests
      query.tenantId = user.id;
    }
    // Single company architecture - Managers can view all maintenance requests

    // Apply filters
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.category) query.category = filters.category;
    if (filters.propertyId) query.propertyId = filters.propertyId;
    if (filters.unitId) query.unitId = filters.unitId;
    if (filters.tenantId) query.tenantId = filters.tenantId;
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;

    // Emergency filter
    if (filters.emergency) {
      query.priority = MaintenancePriority.EMERGENCY;
    }

    // Overdue filter
    if (filters.overdue) {
      const now = new Date();
      const emergencyDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const highDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const mediumDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      const lowDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago

      query.status = {
        $nin: [MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED],
      };
      query.$or = [
        {
          priority: MaintenancePriority.EMERGENCY,
          createdAt: { $lt: emergencyDate },
        },
        { priority: MaintenancePriority.HIGH, createdAt: { $lt: highDate } },
        {
          priority: MaintenancePriority.MEDIUM,
          createdAt: { $lt: mediumDate },
        },
        { priority: MaintenancePriority.LOW, createdAt: { $lt: lowDate } },
      ];
    }

    // Execute paginated query
    const result = await paginateQuery(
      MaintenanceRequest,
      query,
      paginationParams
    );

    // Populate property, tenant, and assigned user information
    const populatedData = await MaintenanceRequest.populate(result.data, [
      {
        path: "propertyId",
        select: "name address type isMultiUnit units",
        options: { lean: true },
      },
      {
        path: "tenantId",
        select: "firstName lastName email phone tenantStatus",
        options: { lean: true },
      },
      {
        path: "assignedTo",
        select: "firstName lastName email phone",
        options: { lean: true },
      },
    ]);

    // Transform the data to match frontend expectations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedData = (populatedData as unknown as any[]).map(
      (request: any) => {
        // Convert to plain object if it's a Mongoose document
        const requestObj = request.toObject ? request.toObject() : request;

        // Find unit information if unitId is present
        let unit = null;
        if (requestObj.unitId && requestObj.propertyId?.units) {
          unit = requestObj.propertyId.units.find(
            (u: any) => u._id.toString() === requestObj.unitId.toString()
          );
        }

        return {
          ...requestObj,
          property: requestObj.propertyId,
          unit: unit,
          tenant: requestObj.tenantId
            ? {
                user: requestObj.tenantId || {},
              }
            : null,
        };
      }
    );

    return createSuccessResponse(
      transformedData,
      "Maintenance requests retrieved successfully",
      result.pagination
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// POST /api/maintenance - Create a new maintenance request
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    const allowedRoles = [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT];

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return createErrorResponse("Forbidden", 403);
    }

    const user = session.user;
    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    // Validate request body
    const validation = validateSchema(maintenanceRequestSchema, body);
    if (!validation.success) {
      return createErrorResponse(validation.errors.join(", "), 400);
    }

    const maintenanceData = validation.data;

    // Verify property exists
    const property = await Property.findById(maintenanceData.propertyId);
    if (!property) {
      return createErrorResponse("Property not found", 404);
    }

    // Verify unit exists if provided (for multi-unit properties)
    if (maintenanceData.unitId) {
      const unitExists = property.units.some(
        (unit: any) => unit._id.toString() === maintenanceData.unitId
      );
      if (!unitExists) {
        return createErrorResponse(
          "Unit not found in the specified property",
          404
        );
      }
    }

    // Verify tenant exists
    const tenant = await User.findOne({
      _id: maintenanceData.tenantId,
      role: UserRole.TENANT,
    });
    if (!tenant) {
      return createErrorResponse("Tenant not found", 404);
    }

    // Role-based authorization
    if (user.role === UserRole.TENANT) {
      // Ensure tenant can only create requests for themselves
      if (user.id !== maintenanceData.tenantId) {
        return createErrorResponse(
          "You can only create maintenance requests for yourself",
          403
        );
      }
    }

    // Verify assigned user if provided
    if (maintenanceData.assignedTo) {
      const assignedUser = await User.findById(maintenanceData.assignedTo);
      if (!assignedUser) {
        return createErrorResponse("Assigned user not found", 404);
      }

      // Accept common maintenance-capable roles
      const role = (assignedUser.role || "").toLowerCase();
      const allowedAssigneeRoles = [
        "maintenance_staff",
        "property_manager",
        "manager",
        "super_admin",
        "admin",
        "technician",
      ];

      if (!allowedAssigneeRoles.includes(role)) {
        return createErrorResponse(
          "User cannot be assigned maintenance requests",
          400
        );
      }
    }

    // Create the maintenance request
    const maintenanceRequest = new MaintenanceRequest({
      ...maintenanceData,
      status: MaintenanceStatus.SUBMITTED,
    });
    await maintenanceRequest.save();

    // Populate property, tenant, and assigned user information
    await maintenanceRequest.populate([
      {
        path: "propertyId",
        select: "name address type",
        options: { lean: true },
      },
      {
        path: "tenantId",
        select: "firstName lastName email phone tenantStatus",
        options: { lean: true },
      },
      {
        path: "assignedTo",
        select: "firstName lastName email phone",
        options: { lean: true },
      },
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
      "Maintenance request created successfully",
      undefined
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PUT /api/maintenance - Bulk update maintenance requests (admin only)
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    if (session.user.role !== UserRole.ADMIN) {
      return createErrorResponse("Forbidden", 403);
    }

    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    const { requestIds, updates } = body;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return createErrorResponse("Request IDs array is required", 400);
    }

    if (!updates || typeof updates !== "object") {
      return createErrorResponse("Updates object is required", 400);
    }

    // Remove fields that shouldn't be bulk updated
    const allowedUpdates = { ...updates };
    delete allowedUpdates._id;
    delete allowedUpdates.propertyId;
    delete allowedUpdates.tenantId;
    delete allowedUpdates.createdAt;
    delete allowedUpdates.updatedAt;

    // Perform bulk update
    const result = await MaintenanceRequest.updateMany(
      { _id: { $in: requestIds } },
      { $set: allowedUpdates }
    );

    return createSuccessResponse(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      `${result.modifiedCount} maintenance requests updated successfully`
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// DELETE /api/maintenance - Bulk delete maintenance requests (admin only)
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check user role
    if (session.user.role !== UserRole.ADMIN) {
      return createErrorResponse("Forbidden", 403);
    }

    const { searchParams } = new URL(request.url);
    const requestIds = searchParams.get("ids")?.split(",") || [];

    if (requestIds.length === 0) {
      return createErrorResponse("Request IDs are required", 400);
    }

    // Check for completed requests
    const completedRequests = await MaintenanceRequest.find({
      _id: { $in: requestIds },
      status: MaintenanceStatus.COMPLETED,
    });

    if (completedRequests.length > 0) {
      return createErrorResponse(
        "Cannot delete completed maintenance requests.",
        409
      );
    }

    // Perform soft delete
    const result = await MaintenanceRequest.updateMany(
      { _id: { $in: requestIds } },
      { $set: { deletedAt: new Date() } }
    );

    return createSuccessResponse(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      `${result.modifiedCount} maintenance requests deleted successfully`
    );
  } catch (error) {
    return handleApiError(error);
  }
}
