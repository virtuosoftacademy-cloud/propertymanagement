/**
 * PropertyPro - Emergency Escalation API Route
 * Handle escalation of emergency maintenance requests
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { MaintenanceRequest, User } from "@/models";
import { UserRole, MaintenanceStatus } from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveUserRole, staffRoleNames } from "@/lib/auth/resolve-role";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
} from "@/lib/api-utils";
import { z } from "zod";

// ============================================================================
// POST /api/maintenance/emergency/escalate - Escalate emergency request
// ============================================================================

const escalationSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
  escalationReason: z.string().optional(),
  escalateTo: z.string().optional(), // Specific user to escalate to
  urgencyLevel: z.enum(["high", "critical"]).default("high"),
  notes: z.string().optional(),
});

// Escalating reassigns the request, and assignment is admin-only — so the
// whole action is admin-only, both the automatic and the explicitly-targeted
// path. A manager can no longer escalate an emergency at all; raising and
// working requests is unaffected.
export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
  try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role check above.
      const denied = requirePermission(user, "maintenance_management");
      if (denied) return denied;

    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    // Validate request body
    const validation = escalationSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse(
        validation.error.errors.map((e) => e.message).join(", "),
        400
      );
    }

    const { requestId, escalationReason, escalateTo, urgencyLevel, notes } =
      validation.data;

    // Find the emergency request
    const emergencyRequest = await MaintenanceRequest.findById(requestId);
    if (!emergencyRequest) {
      return createErrorResponse("Emergency request not found", 404);
    }

    // Verify it's an emergency request
    if (emergencyRequest.priority !== "emergency") {
      return createErrorResponse("Request is not an emergency", 400);
    }

    // Determine escalation target. The caller is necessarily an admin — the
    // route guard above is ADMIN-only — so there is no per-path role check
    // here; only the TARGET still needs validating.
    let escalationTarget;
    if (escalateTo) {
      escalationTarget = await User.findById(escalateTo);
      if (!escalationTarget) {
        return createErrorResponse("Escalation target user not found", 404);
      }

      // Same assignee rule as every other assignment endpoint: resolved role
      // must be staff. Previously there was no role check here at all, so a
      // request could be escalated onto a tenant.
      const targetRole = (await resolveUserRole(escalationTarget.role))
        .effectiveRole;
      if (![UserRole.ADMIN, UserRole.MANAGER].includes(targetRole)) {
        return createErrorResponse(
          "Escalation target must be staff (admin or manager level)",
          400
        );
      }
    } else {
      // Auto-escalate. Matching on role NAMES that resolve to staff, so custom
      // roles such as maintenance_staff are eligible — a plain
      // `$in: [MANAGER, ADMIN]` would only ever pick a built-in user.
      escalationTarget = await User.findOne({
        role: { $in: await staffRoleNames() },
        isActive: true,
      }).sort({ role: 1 });
    }

    if (!escalationTarget) {
      return createErrorResponse("No available escalation target found", 404);
    }

    // Check current escalation level and increment
    const currentEscalationLevel = emergencyRequest.escalationLevel || 0;
    const newEscalationLevel = Math.min(currentEscalationLevel + 1, 3); // Max level 3

    // Prepare escalation log entry
    const escalationLogEntry = {
      escalatedBy: user.id,
      escalatedTo: escalationTarget._id,
      reason: escalationReason || `Escalated to level ${newEscalationLevel}`,
      urgencyLevel,
      notes,
      timestamp: new Date(),
      level: newEscalationLevel,
    };

    // Update the request with escalation info
    const updateData: any = {
      assignedTo: escalationTarget._id,
      status: MaintenanceStatus.ASSIGNED,
      escalationLevel: newEscalationLevel,
      updatedAt: new Date(),
      updatedBy: user.id,
      $push: {
        escalationLogs: escalationLogEntry,
      },
    };

    // Add notes if provided
    if (notes || escalationReason) {
      const escalationNote = `ESCALATED to Level ${newEscalationLevel}${
        escalationReason ? `: ${escalationReason}` : ""
      }${notes ? `\nNotes: ${notes}` : ""}`;
      updateData.$push.notes = {
        content: escalationNote,
        createdBy: user.id,
        createdAt: new Date(),
      };
    }

    await MaintenanceRequest.findByIdAndUpdate(requestId, updateData);

    // Create escalation log entry (this could be a separate collection in a real app)
    const escalationLog = {
      requestId: emergencyRequest._id,
      escalatedBy: user.id,
      escalatedTo: escalationTarget._id,
      reason: escalationReason,
      urgencyLevel,
      notes,
      timestamp: new Date(),
    };

    // Populate the updated request for response
    const populatedRequest = await MaintenanceRequest.findById(
      emergencyRequest._id
    )
      .populate("propertyId", "name address")
      .populate({
        path: "tenantId",
        populate: {
          path: "userId",
          select: "firstName lastName email phone",
        },
      })
      .populate("assignedTo", "firstName lastName email");

    // TODO: Send escalation notifications
    // - Email to escalation target
    // - SMS if critical
    // - Push notification
    // - Update dashboard alerts

    return createSuccessResponse(
      {
        request: populatedRequest,
        escalation: escalationLog,
      },
      "Emergency request escalated successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});

// ============================================================================
// GET /api/maintenance/emergency/escalate - Get escalation history
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
])(async (user, request: NextRequest) => {
  try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role check above.
      const denied = requirePermission(user, "maintenance_view");
      if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const limit = parseInt(searchParams.get("limit") || "12");

    let query: any = {};
    if (requestId) {
      query.requestId = requestId;
    }

    // In a real application, this would query an escalation log collection
    // For now, we'll return escalation info from maintenance request notes
    const escalatedRequests = await MaintenanceRequest.find({
      priority: "emergency",
      notes: { $regex: "ESCALATED:", $options: "i" },
      deletedAt: null,
      ...query,
    })
      .populate("propertyId", "name address")
      .populate({
        path: "tenantId",
        populate: {
          path: "userId",
          select: "firstName lastName email",
        },
      })
      .populate("assignedTo", "firstName lastName email")
      .sort({ updatedAt: -1 })
      .limit(limit);

    // Extract escalation info from notes (simplified approach)
    const escalations = escalatedRequests.map((request) => {
      const escalationMatch = request.notes?.match(/ESCALATED: (.+?)(?:\n|$)/);
      return {
        requestId: request._id,
        request: {
          title: request.title,
          status: request.status,
          createdAt: request.createdAt,
          property: request.propertyId,
          tenant: request.tenantId,
          assignedTo: request.assignedTo,
        },
        escalationReason: escalationMatch ? escalationMatch[1] : "Unknown",
        timestamp: request.updatedAt,
      };
    });

    return createSuccessResponse(
      escalations,
      "Escalation history retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});
