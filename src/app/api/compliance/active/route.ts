/**
 * PropertyPro - Compliance Report Item API Routes
 * Operations on a single compliance report
 *
 * Routes:
 *   GET    /api/compliance/:id           → Get one compliance report
 *   PUT    /api/compliance/:id           → Update compliance report
 *   DELETE /api/compliance/:id           → Soft-delete (or hard-delete with ?hard=true, admin only)
 *   POST   /api/compliance/:id/revoke    → (See [id]/revoke/route.ts)
 *   POST   /api/compliance/:id/renew     → (See [id]/renew/route.ts)
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { ComplianceReport } from "@/models";
import { UserRole, ComplianceStatus } from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
} from "@/lib/api-utils";
import {
  complianceReportUpdateSchema,
  validateSchema,
} from "@/lib/validations";

const isValidId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// ============================================================================
// GET /api/compliance/:id
// Fetch a single compliance report with populated relations
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user: any, request: NextRequest, context: { params: { id: string } }) => {
    try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role list above.
      const denied = requirePermission(user, "compliance_view");
      if (denied) return denied;

      const { id } = await context.params;

      if (!isValidId(id)) {
        return createErrorResponse("Invalid compliance report ID", 400);
      }

      const report = await ComplianceReport.findOne({
        _id: id,
        deletedAt: null,
      })
        .populate("propertyId", "name address type isMultiUnit totalUnits")
        .populate("createdBy", "firstName lastName email avatar role");

      if (!report) {
        return createErrorResponse("Compliance report not found", 404);
      }

      return createSuccessResponse(
        report,
        "Compliance report retrieved successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/compliance/:id
// Update a compliance report
// ============================================================================

export const PUT = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user: any, request: NextRequest, context: { params: { id: string } }) => {
    try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role list above.
      const denied = requirePermission(user, "compliance_edit");
      if (denied) return denied;

      const { id } = await context.params;

      if (!isValidId(id)) {
        return createErrorResponse("Invalid compliance report ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      const validation = validateSchema(complianceReportUpdateSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const updates = validation.data;

      // ─── Existence check ────────────────────────────────────────────────
      const report = await ComplianceReport.findOne({
        _id: id,
        deletedAt: null,
      });

      if (!report) {
        return createErrorResponse("Compliance report not found", 404);
      }

      // Block edits to revoked reports - they should renew instead
      if (report.status === ComplianceStatus.REVOKED) {
        return createErrorResponse(
          "Cannot update a revoked compliance report. Use renew to issue a new certificate.",
          409
        );
      }

      // ─── Cross-field validation when only one date is supplied ──────────
      // Update schema validates expiry > issue when both are provided.
      // If only one is being changed, validate against the existing value.
      if (updates.issueDate && !updates.expiryDate) {
        if (report.expiryDate <= updates.issueDate) {
          return createErrorResponse(
            "New issue date must be before the current expiry date",
            400
          );
        }
      }
      if (updates.expiryDate && !updates.issueDate) {
        if (updates.expiryDate <= report.issueDate) {
          return createErrorResponse(
            "New expiry date must be after the current issue date",
            400
          );
        }
      }

      // ─── Apply updates and save (so pre-save hooks fire) ────────────────
      Object.assign(report, updates);
      await report.save();

      // ─── Populate response data ─────────────────────────────────────────
      await report.populate([
        {
          path: "propertyId",
          select: "name address type isMultiUnit totalUnits",
        },
        {
          path: "createdBy",
          select: "firstName lastName email avatar role",
        },
      ]);

      return createSuccessResponse(
        report,
        "Compliance report updated successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/compliance/:id
// Soft-delete by default. Pass ?hard=true to permanently delete (admin only).
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user: any, request: NextRequest, context: { params: { id: string } }) => {
    try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role list above.
      const denied = requirePermission(user, "compliance_delete");
      if (denied) return denied;

      const { id } = await context.params;

      if (!isValidId(id)) {
        return createErrorResponse("Invalid compliance report ID", 400);
      }

      const { searchParams } = new URL(request.url);
      const hard = searchParams.get("hard") === "true";

      // Restrict hard delete to admins only
      if (hard && user.role !== UserRole.ADMIN) {
        return createErrorResponse(
          "Only admins can permanently delete compliance reports",
          403
        );
      }

      const report = await ComplianceReport.findOne({
        _id: id,
        deletedAt: null,
      });

      if (!report) {
        return createErrorResponse("Compliance report not found", 404);
      }

      // Block deleting active reports - they should be revoked first
      if (
        !hard &&
        [ComplianceStatus.ACTIVE, ComplianceStatus.EXPIRING_SOON].includes(
          report.status as ComplianceStatus
        )
      ) {
        return createErrorResponse(
          "Cannot delete an active compliance report. Revoke it first.",
          409
        );
      }

      if (hard) {
        await ComplianceReport.deleteOne({ _id: report._id });
        return createSuccessResponse(
          { id: report._id, deleted: "hard" },
          "Compliance report permanently deleted"
        );
      }

      report.deletedAt = new Date();
      await report.save();

      return createSuccessResponse(
        { id: report._id, deleted: "soft" },
        "Compliance report deleted successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);