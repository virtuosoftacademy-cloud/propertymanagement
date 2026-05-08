/**
 * PropertyPro - Renew Compliance Report
 * POST /api/compliance/:id/renew
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { ComplianceReport } from "@/models";
import { UserRole, ComplianceCategory } from "@/types";
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

const ValidCategories = Object.values(ComplianceCategory) as string[];

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
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      });

      if (!report) {
        return createErrorResponse("Compliance report not found", 404);
      }

      const { issueDate, expiryDate, notes } = validation.data;

      if (expiryDate <= report.expiryDate) {
        return createErrorResponse(
          "New expiry date must be later than the current expiry date",
          400
        );
      }

      // ─── Defensive: catch stale/invalid category values ────────────────
      // If the document has a legacy category that's no longer in the enum,
      // the save() inside renew() will fail with a confusing validation error.
      // Surface this clearly instead.
      if (!ValidCategories.includes(report.category as string)) {
        return createErrorResponse(
          `This report has an invalid category (${report.category}). ` +
            `Please edit the report and select a valid category before renewing.`,
          400
        );
      }

      // ─── Apply renewal ────────────────────────────────────────────────
      try {
        await report.renew(issueDate, expiryDate, notes);
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
        throw saveErr; // let handleApiError handle anything else
      }

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
      console.error("[POST /api/compliance/:id/renew]", error);
      return handleApiError(error);
    }
  }
);