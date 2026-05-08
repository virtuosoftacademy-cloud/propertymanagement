/**
 * PropertyPro - Financial Actions Detail API
 * Retrieve, update, and delete individual financial remediation tasks
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { FinancialAction } from "@/models";
import { UserRole } from "@/types";
import {
  createErrorResponse,
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
  isValidObjectId,
  parseRequestBody,
} from "@/lib/api-utils";

const statusEnum = ["pending", "in-progress", "completed"] as const;
const priorityEnum = ["low", "medium", "high"] as const;
const categoryEnum = [
  "revenue",
  "collections",
  "profitability",
  "cash-flow",
  "expenses",
  "portfolio",
  "risk",
  "general",
] as const;
const reportTypeEnum = [
  "analytics",
  "profit-loss",
  "cash-flow",
  "property-performance",
  "expense-analysis",
  "summary",
] as const;

const updateActionSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title too long")
      .optional(),
    description: z.string().max(4000, "Description too long").optional(),
    status: z.enum(statusEnum).optional(),
    priority: z.enum(priorityEnum).optional(),
    category: z.enum(categoryEnum).optional(),
    reportType: z.enum(reportTypeEnum).optional(),
    dueDate: z
      .union([z.string(), z.date(), z.null()])
      .optional()
      .transform((value) => {
        if (value === null) return null;
        if (!value) return undefined;
        const dateValue = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(dateValue.getTime())) {
          throw new Error("Invalid due date");
        }
        return dateValue;
      }),
    propertyId: z
      .string()
      .optional()
      .refine((val) => !val || isValidObjectId(val), "Invalid propertyId"),
    tags: z
      .array(z.string().min(1, "Tag cannot be empty").max(40, "Tag too long"))
      .max(10, "Too many tags")
      .optional(),
  })
  .refine(
    (payload) => Object.values(payload).some((value) => value !== undefined),
    {
      message: "No updates provided",
      path: [],
    }
  );

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (_user, request: NextRequest, context: { params: { id: string } }) => {
    try {
      const { id } = context.params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid action id", 400);
      }

      const action = await FinancialAction.findById(id)
        .populate([
          { path: "createdBy", select: "firstName lastName email" },
          { path: "updatedBy", select: "firstName lastName email" },
          { path: "propertyId", select: "name" },
        ])
        .lean();

      if (!action) {
        return createErrorResponse("Financial action not found", 404);
      }

      return createSuccessResponse(
        action,
        "Financial action retrieved successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const PUT = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user, request: NextRequest, context: { params: { id: string } }) => {
    try {
      const { id } = context.params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid action id", 400);
      }

      const { success, data, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      const validation = updateActionSchema.safeParse(data);
      if (!validation.success) {
        const message = validation.error.errors
          .map((err) => err.message)
          .join(", ");
        return createErrorResponse(`Validation failed: ${message}`, 400);
      }

      const payload = validation.data;

      const update: Record<string, unknown> = {
        updatedBy: user.id,
      };

      if (payload.title !== undefined) update.title = payload.title;
      if (payload.description !== undefined)
        update.description = payload.description;
      if (payload.priority !== undefined) update.priority = payload.priority;
      if (payload.category !== undefined) update.category = payload.category;
      if (payload.reportType !== undefined)
        update.reportType = payload.reportType;
      if (payload.propertyId !== undefined)
        update.propertyId = payload.propertyId;
      if (payload.tags !== undefined) update.tags = payload.tags;

      if (payload.status !== undefined) {
        update.status = payload.status;
        if (payload.status === "completed") {
          update.completedAt = new Date();
        } else {
          update.completedAt = null;
        }
      }

      if (payload.dueDate !== undefined) {
        update.dueDate = payload.dueDate === null ? null : payload.dueDate;
      }

      const updated = await FinancialAction.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      }).populate([
        { path: "createdBy", select: "firstName lastName email" },
        { path: "updatedBy", select: "firstName lastName email" },
        { path: "propertyId", select: "name" },
      ]);

      if (!updated) {
        return createErrorResponse("Financial action not found", 404);
      }

      return createSuccessResponse(
        updated,
        "Financial action updated successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const DELETE = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (_user, _request: NextRequest, context: { params: { id: string } }) => {
    try {
      const { id } = context.params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid action id", 400);
      }

      const action = await FinancialAction.findByIdAndDelete(id);
      if (!action) {
        return createErrorResponse("Financial action not found", 404);
      }

      return createSuccessResponse(
        { deleted: true },
        "Financial action deleted successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
