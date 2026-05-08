/**
 * PropertyPro - Application Submit API Route
 * Submit an application for review
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
  isValidObjectId,
} from "@/lib/api-utils";

// ============================================================================
// POST /api/applications/[id]/submit - Submit an application
// ============================================================================

export const POST = withRoleAndDB([
  UserRole.TENANT,
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

      // Find the application
      const application = await Application.findById(id)
        .populate("propertyId", "name address")
        .populate("applicantId", "firstName lastName email");

      if (!application) {
        return createErrorResponse("Application not found", 404);
      }

      // Check permissions - only the applicant or authorized staff can submit
      // Single company architecture - Managers can submit all applications
      const canSubmit =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.MANAGER ||
        application.applicantId._id.toString() === user.id;

      if (!canSubmit) {
        return createErrorResponse("Access denied", 403);
      }

      // Check if application can be submitted
      if (application.status !== ApplicationStatus.DRAFT) {
        return createErrorResponse(
          "Application has already been submitted",
          400
        );
      }

      // Validate required fields for submission
      const requiredFields = [
        "personalInfo.firstName",
        "personalInfo.lastName",
        "personalInfo.email",
        "personalInfo.phone",
        "personalInfo.dateOfBirth",
      ];

      for (const field of requiredFields) {
        const fieldValue = field
          .split(".")
          .reduce((obj, key) => obj?.[key], application);
        if (!fieldValue) {
          return createErrorResponse(`Missing required field: ${field}`, 400);
        }
      }

      // Check if application fee is paid (if required)
      if (
        application.applicationFee.amount > 0 &&
        application.applicationFee.status !== "paid"
      ) {
        return createErrorResponse(
          "Application fee must be paid before submission",
          400
        );
      }

      // Submit the application
      await application.submit();

      return createSuccessResponse(
        { application },
        "Application submitted successfully"
      );
    } catch (error) {
      return handleApiError(error, "Failed to submit application");
    }
  }
);
