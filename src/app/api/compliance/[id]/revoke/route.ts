/**
 * PropertyPro - Revoke Compliance Report
 * POST /api/compliance/:id/revoke
 *
 * Marks a compliance certificate as revoked. The reason is appended to the
 * report's notes field. This is a one-way action - to issue a new certificate
 * after revocation, use the renew/reissue endpoint.
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { ComplianceReport } from "@/models";
import { UserRole, ComplianceStatus, ComplianceCategoryLabels} from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
} from "@/lib/api-utils";
import { validateSchema } from "@/lib/validations";

const revokeSchema = z.object({
  reason: z
    .string()
    .min(1, "Reason is required")
    .max(1000, "Reason cannot exceed 1000 characters"),
});

const isValidId = (id: unknown): id is string =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

async function extractId(context: any): Promise<string | null> {
  if (!context) return null;
  if (typeof context.id === "string") return context.id;
  const raw = context.params;
  if (!raw) return null;
  if (typeof raw.then === "function") {
    const resolved = await raw;
    return resolved?.id ?? null;
  }
  return raw.id ?? null;
}

const VALID_CATEGORIES = Object.values(ComplianceCategoryLabels) as string[];

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user: any, request: NextRequest, context: any) => {
    try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role list above.
      const denied = requirePermission(user, "compliance_edit");
      if (denied) return denied;

      const id = await extractId(context);

      if (!id) {
        return createErrorResponse(
          "Missing compliance report ID in route params",
          400
        );
      }

      if (!isValidId(id)) {
        return createErrorResponse(
          `Invalid compliance report ID: ${id}`,
          400
        );
      }

      // ─── Parse & validate body ──────────────────────────────────────────
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      const validation = validateSchema(revokeSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      // ─── Existence check ────────────────────────────────────────────────
      const report = await ComplianceReport.findOne({
        _id: id,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      });

      if (!report) {
        return createErrorResponse("Compliance report not found", 404);
      }

      // ─── Status check ──────────────────────────────────────────────────
      if (report.status === ComplianceStatus.REVOKED) {
        return createErrorResponse(
          "Compliance report is already revoked",
          409
        );
      }

      try {
        await report.revoke(validation.data.reason);
      } catch (saveErr: any) {
        // Surface mongoose validation errors with field-level detail
        if (saveErr?.name === "ValidationError" && saveErr?.errors) {
          const fieldErrors = Object.entries(saveErr.errors).map(
            ([field, err]: [string, any]) => `${field}: ${err.message}`
          );
          return createErrorResponse(
            `Validation failed: ${fieldErrors.join("; ")}`,
            400
          );
        }
        throw saveErr;
      }

      // ─── Populate response ─────────────────────────────────────────────
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
        "Compliance report revoked successfully"
      );
    } catch (error) {
      console.error("[POST /api/compliance/:id/revoke]", error);
      return handleApiError(error);
    }
  }
);