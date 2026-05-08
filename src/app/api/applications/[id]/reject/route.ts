/**
 * PropertyPro - Application Reject API Route
 * Reject an application
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Application } from "@/models";
import { UserRole, ApplicationStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
  isValidObjectId,
} from "@/lib/api-utils";

// ============================================================================
// POST /api/applications/[id]/reject - Reject an application
// ============================================================================

export const POST = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid application ID", 400);
      }

      const { success, data: body } = await parseRequestBody(request);
      const notes = success ? body?.notes : undefined;

      // Find the application
      const application = await Application.findById(id)
        .populate("propertyId", "name address")
        .populate("applicantId", "firstName lastName email");

      if (!application) {
        return createErrorResponse("Application not found", 404);
      }

      // Check if application can be rejected
      const validStatuses = [
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.SCREENING_IN_PROGRESS,
      ];

      if (!validStatuses.includes(application.status)) {
        return createErrorResponse(
          "Application cannot be rejected in its current status",
          400
        );
      }

      // Reject the application
      await application.reject(user.id, notes);

      return createSuccessResponse(
        { application },
        "Application rejected successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
