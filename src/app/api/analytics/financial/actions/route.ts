/**
 * PropertyPro - Financial Actions API
 * Manage remediation tasks surfaced by financial analytics dashboards
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
  parseRequestBody,
  createPaginationInfo,
  isValidObjectId,
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

const createActionSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(4000, "Description too long").optional(),
  status: z.enum(statusEnum).optional(),
  priority: z.enum(priorityEnum).optional(),
  category: z.enum(categoryEnum).optional(),
  reportType: z.enum(reportTypeEnum).optional(),
  dueDate: z
    .union([z.string(), z.date()])
    .optional()
    .transform((value) => {
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
    .refine((value) => !value || isValidObjectId(value), "Invalid propertyId"),
  tags: z
    .array(z.string().min(1, "Tag cannot be empty").max(40, "Tag too long"))
    .max(10, "Too many tags")
    .optional(),
});

const querySchema = z.object({
  status: z.enum(statusEnum).optional(),
  priority: z.enum(priorityEnum).optional(),
  category: z.enum(categoryEnum).optional(),
  reportType: z.enum(reportTypeEnum).optional(),
  propertyId: z
    .string()
    .optional()
    .refine((value) => !value || isValidObjectId(value), "Invalid propertyId"),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (_user, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const rawParams = Object.fromEntries(searchParams.entries());
      const validated = querySchema.safeParse(rawParams);

      if (!validated.success) {
        const errorMessage = validated.error.errors
          .map((err) => err.message)
          .join(", ");
        return createErrorResponse(
          `Invalid query parameters: ${errorMessage}`,
          400
        );
      }

      const {
        page,
        limit,
        status,
        priority,
        category,
        reportType,
        propertyId,
        search,
      } = validated.data;

      const query: Record<string, unknown> = {};

      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (category) query.category = category;
      if (reportType) query.reportType = reportType;
      if (propertyId) query.propertyId = propertyId;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;

      const [actions, total] = await Promise.all([
        FinancialAction.find(query)
          .sort({ status: 1, priority: -1, dueDate: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate([
            { path: "createdBy", select: "firstName lastName email" },
            { path: "updatedBy", select: "firstName lastName email" },
            { path: "propertyId", select: "name" },
          ])
          .lean(),
        FinancialAction.countDocuments(query),
      ]);

      const pagination = createPaginationInfo(page, limit, total);

      return createSuccessResponse(
        actions,
        "Financial actions retrieved successfully",
        pagination
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      const validation = createActionSchema.safeParse(body);
      if (!validation.success) {
        const message = validation.error.errors
          .map((err) => err.message)
          .join(", ");
        return createErrorResponse(`Validation failed: ${message}`, 400);
      }

      const payload = validation.data;

      const action = await FinancialAction.create({
        title: payload.title,
        description: payload.description,
        status: payload.status || "pending",
        priority: payload.priority || "medium",
        category: payload.category || "general",
        reportType: payload.reportType || "analytics",
        dueDate: payload.dueDate,
        propertyId: payload.propertyId,
        tags: payload.tags || [],
        createdBy: user.id,
        completedAt: payload.status === "completed" ? new Date() : undefined,
      });

      const populated = await action.populate([
        { path: "createdBy", select: "firstName lastName email" },
        { path: "propertyId", select: "name" },
      ]);

      return createSuccessResponse(
        populated,
        "Financial action created successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
