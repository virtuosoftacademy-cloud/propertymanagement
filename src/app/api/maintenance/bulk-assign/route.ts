/**
 * PropertyPro - Bulk Assign Maintenance Requests API
 * API endpoint for bulk assignment of maintenance requests
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { MaintenanceRequest, User } from "@/models";
import { UserRole, MaintenanceStatus } from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveUserRole } from "@/lib/auth/resolve-role";
import {
  createSuccessResponse,
  createErrorResponse,
  withRoleAndDB,
  isValidObjectId,
} from "@/lib/api-utils";
import { z } from "zod";

// Validation schema for bulk assign request
const bulkAssignSchema = z.object({
  requestIds: z.array(z.string()).min(1, "At least one request ID is required"),
  assigneeId: z.string().min(1, "Assignee ID is required"),
  notes: z.string().optional(),
});

// ============================================================================
// POST /api/maintenance/bulk-assign - Bulk assign maintenance requests
// ============================================================================

// Assigning maintenance requests is an ADMIN-only action. Managers may raise,
// update and close requests, but deciding WHO does the work rests with an
// admin. A custom role resolving to admin passes; one resolving to manager does
// not, which is the whole point of comparing the resolved role.
export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
  try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role check above.
      const denied = requirePermission(user, "maintenance_assign");
      if (denied) return denied;

    const body = await request.json();
    const validatedData = bulkAssignSchema.parse(body);
    const { requestIds, assigneeId, notes } = validatedData;

    // Validate all request IDs
    const invalidIds = requestIds.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return createErrorResponse(
        `Invalid request IDs: ${invalidIds.join(", ")}`,
        400
      );
    }

    // Validate assignee ID
    if (!isValidObjectId(assigneeId)) {
      return createErrorResponse("Invalid assignee ID", 400);
    }

    // Check if assignee exists and has appropriate role
    const assignee = await User.findById(assigneeId);
    if (!assignee) {
      return createErrorResponse("Assignee not found", 404);
    }

    // Resolved, not raw — otherwise a custom role that inherits from manager
    // (maintenance_staff, agent) cannot be assigned work.
    const assigneeRole = (await resolveUserRole(assignee.role)).effectiveRole;

    if (![UserRole.ADMIN, UserRole.MANAGER].includes(assigneeRole)) {
      return createErrorResponse(
        "Assignee must be maintenance staff or manager",
        400
      );
    }

    // Find all requests to be assigned
    const requests = await MaintenanceRequest.find({
      _id: { $in: requestIds },
      deletedAt: null,
    });

    if (requests.length === 0) {
      return createErrorResponse("No valid requests found", 404);
    }

    if (requests.length !== requestIds.length) {
      return createErrorResponse("Some requests were not found", 400);
    }

    // Update all requests
    const updateData: any = {
      assignedTo: assigneeId,
      status: MaintenanceStatus.ASSIGNED,
      updatedAt: new Date(),
      updatedBy: user.id,
    };

    if (notes) {
      updateData.$push = {
        notes: {
          content: notes,
          createdBy: user.id,
          createdAt: new Date(),
        },
      };
    }

    const result = await MaintenanceRequest.updateMany(
      { _id: { $in: requestIds } },
      updateData
    );

    return createSuccessResponse({
      message: `Successfully assigned ${result.modifiedCount} requests`,
      assignedCount: result.modifiedCount,
      assigneeName: `${assignee.firstName} ${assignee.lastName}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        `Validation error: ${error.errors.map((e) => e.message).join(", ")}`,
        400
      );
    }

    return createErrorResponse(
      error instanceof Error ? error.message : "Failed to assign requests",
      500
    );
  }
});
