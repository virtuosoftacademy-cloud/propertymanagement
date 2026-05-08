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
import { UserRole, ComplianceStatus, ComplianceCategory, COMPLIANCE_CATEGORY_LABELS} from "@/types";
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

/**
 * Extract `id` from route context.
 * Handles Next.js 15 Promise-based params, Next.js 14 sync params,
 * and middleware variants that flatten params onto context.
 */
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

const VALID_CATEGORIES = Object.values(COMPLIANCE_CATEGORY_LABELS) as string[];

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (_user: any, request: NextRequest, context: any) => {
    try {
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

      // ─── Defensive: catch stale/invalid category values ────────────────
      // If the document has a legacy category that's no longer in the enum,
      // the save() inside revoke() will fail with a confusing validation error.
      // Surface this clearly instead.
      if (!VALID_CATEGORIES.includes(report.category as string)) {
        return createErrorResponse(
          `This report has an invalid category (${report.category}). ` +
            `Please edit the report and select a valid category before revoking.`,
          400
        );
      }

      // ─── Apply revocation ──────────────────────────────────────────────
      // The schema's revoke() instance method appends the reason to notes
      // and sets status to REVOKED.
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