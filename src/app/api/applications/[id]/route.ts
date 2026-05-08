/**
 * PropertyPro - Individual Application API Routes
 * CRUD operations for individual applications
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { Application, Property, User } from "@/models";
import { UserRole, ApplicationStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
  isValidObjectId,
} from "@/lib/api-utils";
import { applicationUpdateSchema, validateSchema } from "@/lib/validations";

// ============================================================================
// GET /api/applications/[id] - Get a specific application
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
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
        .populate("propertyId", "name address type rentAmount securityDeposit")
        .populate("applicantId", "firstName lastName email phone")
        .populate("reviewedBy", "firstName lastName email");

      if (!application) {
        return createErrorResponse("Application not found", 404);
      }

      // Check permissions
      // Single company architecture - Managers can access all applications
      const canAccess =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.MANAGER ||
        application.applicantId._id.toString() === user.id;

      if (!canAccess) {
        return createErrorResponse("Access denied", 403);
      }

      return createSuccessResponse({ application });
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/applications/[id] - Update an application
// ============================================================================

export const PUT = withRoleAndDB([
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

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Find the application
      const application = await Application.findById(id);
      if (!application) {
        return createErrorResponse("Application not found", 404);
      }

      // Check permissions
      // Single company architecture - Managers can edit all applications
      const canEdit =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.MANAGER ||
        (application.applicantId.toString() === user.id &&
          [ApplicationStatus.DRAFT, ApplicationStatus.SUBMITTED].includes(
            application.status
          ));

      if (!canEdit) {
        return createErrorResponse("Cannot edit this application", 403);
      }

      // Validate request body
      const validation = validateSchema(applicationUpdateSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const updateData = validation.data;

      // Restrict what tenants can update
      if (user.role === UserRole.TENANT) {
        // Tenants can only update their own applications and only certain fields
        const allowedFields = [
          "personalInfo",
          "employmentInfo",
          "emergencyContacts",
          "previousAddresses",
          "documents",
          "additionalInfo",
        ];

        const restrictedUpdate: any = {};
        for (const field of allowedFields) {
          if (updateData[field] !== undefined) {
            restrictedUpdate[field] = updateData[field];
          }
        }

        Object.assign(application, restrictedUpdate);
      } else {
        // Property managers and admins can update more fields
        Object.assign(application, updateData);
      }

      await application.save();

      // Populate the response
      await application.populate([
        { path: "propertyId", select: "name address type rentAmount" },
        { path: "applicantId", select: "firstName lastName email" },
        { path: "reviewedBy", select: "firstName lastName" },
      ]);

      return createSuccessResponse(
        { application },
        "Application updated successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/applications/[id] - Delete an application (soft delete)
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
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
      const application = await Application.findById(id);
      if (!application) {
        return createErrorResponse("Application not found", 404);
      }

      // Check permissions
      const canDelete =
        user.role === UserRole.ADMIN ||
        (application.applicantId.toString() === user.id &&
          [ApplicationStatus.DRAFT, ApplicationStatus.SUBMITTED].includes(
            application.status
          )) ||
        user.role === UserRole.MANAGER;

      if (!canDelete) {
        return createErrorResponse("Cannot delete this application", 403);
      }

      // Soft delete
      application.deletedAt = new Date();
      await application.save();

      return createSuccessResponse(null, "Application deleted successfully");
    } catch (error) {
      return handleApiError(error);
    }
  }
);
