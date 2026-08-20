/**
 * PropertyPro - Renew Compliance Report
 *
 * Routes:
 *   POST /api/compliance/:id/renew   → Renew certificate with new dates
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { ComplianceReport } from "@/models";
import { UserRole } from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
} from "@/lib/api-utils";
import { validateSchema } from "@/lib/validations";

const renewSchema = z
  .object({
    issueDate: z.coerce.date(),
    expiryDate: z.coerce.date(),
    notes: z.string().max(1000).optional(),
  })
  .refine((data) => data.expiryDate > data.issueDate, {
    message: "Expiry date must be after issue date",
    path: ["expiryDate"],
  })
  .refine((data) => data.issueDate <= new Date(), {
    message: "Issue date cannot be in the future",
    path: ["issueDate"],
  });

const isValidId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// ============================================================================
// POST /api/compliance/:id/renew
// Renew a compliance certificate with new validity period
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
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

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      const validation = validateSchema(renewSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const report = await ComplianceReport.findOne({
        _id: id,
        deletedAt: null,
      });

      if (!report) {
        return createErrorResponse("Compliance report not found", 404);
      }

      const { issueDate, expiryDate, notes } = validation.data;

      // The new validity period must extend beyond the current one
      if (expiryDate <= report.expiryDate) {
        return createErrorResponse(
          "New expiry date must be later than the current expiry date",
          400
        );
      }

      await report.renew(issueDate, expiryDate, notes);

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
        "Compliance report renewed successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);