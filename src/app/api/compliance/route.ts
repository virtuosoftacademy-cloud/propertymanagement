/**
 * PropertyPro - Compliance Reports API Routes (Full Version)
 * CRUD operations for compliance certificate management
 *
 * Routes:
 *   GET    /api/compliance           → List compliance reports (paginated, filtered)
 *   POST   /api/compliance           → Create new compliance report
 *   PUT    /api/compliance           → Bulk update reports (admin only)
 *   DELETE /api/compliance?ids=...   → Bulk soft-delete reports (admin only)
 */

import { NextRequest } from "next/server";
import { ComplianceReport, Property } from "@/models";
import { UserRole, ComplianceStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parsePaginationParams,
  paginateQuery,
  parseRequestBody,
} from "@/lib/api-utils";
import {
  complianceBulkUpdateSchema,
  complianceReportSchema,
  paginationSchema,
  validateSchema,
} from "@/lib/validations";

// ============================================================================
// GET /api/compliance
// List compliance reports with pagination, filtering, search, and population
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (_user: any, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const paginationParams = parsePaginationParams(searchParams);

      // Compliance-specific filters
      const status = searchParams.get("status") || undefined;
      const propertyId = searchParams.get("propertyId") || undefined;
      const category = searchParams.get("category") || undefined;
      const isExpired = searchParams.get("isExpired") === "true";
      const isExpiringSoon = searchParams.get("isExpiringSoon") === "true";
      const expiringWithin = searchParams.get("expiringWithin") || undefined;
      const startDate = searchParams.get("startDate") || undefined;
      const endDate = searchParams.get("endDate") || undefined;

      const validation = validateSchema(paginationSchema, paginationParams);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const filters = validation.data;

      // ─── Build base query ──────────────────────────────────────────────
      const query: any = { deletedAt: null };

      if (propertyId) query.propertyId = propertyId;
      if (category) query.category = category;

      // ─── Status / expiry handling ──────────────────────────────────────
      // Build status conditions in a single object so user-supplied status
      // and isExpired/isExpiringSoon filters can coexist without overwriting
      // each other.
      if (isExpired) {
        query.expiryDate = { $lt: new Date() };
        // Only set the status restriction if the user didn't pick one
        if (status) {
          query.status = status;
        } else {
          query.status = { $ne: ComplianceStatus.REVOKED };
        }
      } else if (isExpiringSoon || expiringWithin) {
        const days = expiringWithin ? parseInt(expiringWithin) || 30 : 30;
        const now = new Date();
        const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        query.expiryDate = { $gte: now, $lte: futureDate };
        if (status) {
          query.status = status;
        } else {
          query.status = {
            $nin: [ComplianceStatus.EXPIRED, ComplianceStatus.REVOKED],
          };
        }
      } else if (status) {
        query.status = status;
      }

      // ─── Issue-date range filter ──────────────────────────────────────
      if (startDate || endDate) {
        query.issueDate = {};
        if (startDate) query.issueDate.$gte = new Date(startDate);
        if (endDate) query.issueDate.$lte = new Date(endDate);
      }

      // ─── Search: applied in DB query, not post-pagination ─────────────
      // Searching after pagination breaks page counts and total. Apply
      // a regex OR across searchable fields directly in the query so the
      // pagination total reflects the true result set.
      //
      // Note: This searches local fields only (category, notes, status, _id).
      // Searching populated fields like property.name would require an
      // aggregation pipeline with $lookup. Worth adding if needed.
      if (
        filters.search &&
        typeof filters.search === "string" &&
        filters.search.trim()
      ) {
        const term = filters.search
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(term, "i");
        query.$or = [
          { category: regex },
          { notes: regex },
          { status: regex },
        ];
      }

      // ─── Pagination & sort ─────────────────────────────────────────────
      // Pass sort options through to paginateQuery
      const queryFilters = {
        ...filters,
        sortBy: filters.sortBy || "expiryDate",
        sortOrder: filters.sortOrder || "asc",
      };

      const result = await paginateQuery(
        ComplianceReport,
        query,
        queryFilters
      );

      // ─── Populate relations ────────────────────────────────────────────
      const populated = await ComplianceReport.populate(result.data, [
        {
          path: "propertyId",
          select: "name address type isMultiUnit totalUnits",
        },
        {
          path: "createdBy",
          select: "firstName lastName email avatar role",
        },
      ]);

      // Use the original pagination from paginateQuery — it already reflects
      // the true total since search is now part of the DB query.
      return createSuccessResponse(
        populated,
        "Compliance reports retrieved successfully",
        result.pagination
      );
    } catch (error) {
      console.error("[GET /api/compliance]", error);
      return handleApiError(error);
    }
  }
);

// ============================================================================
// POST /api/compliance
// Create new compliance report
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user: any, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      const validation = validateSchema(complianceReportSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const reportData = validation.data;

      // Resolve creator id - depends on what `withRoleAndDB` injects
      const creatorId = user?.id || user?._id || user?.userId;
      if (!creatorId) {
        return createErrorResponse(
          "Could not resolve current user from session",
          401
        );
      }

      // ─── Existence check ────────────────────────────────────────────────
      const property = await Property.findById(reportData.propertyId);
      if (!property) {
        return createErrorResponse("Property not found", 404);
      }
      if (property.deletedAt) {
        return createErrorResponse("Property has been deleted", 400);
      }

      // ─── Duplicate prevention ───────────────────────────────────────────
      // Block creating an overlapping active certificate of the same category
      // for the same property. Renewal/reissue should use the existing report.
      const overlapping = await ComplianceReport.findOne({
        propertyId: reportData.propertyId,
        category: reportData.category,
        status: {
          $in: [ComplianceStatus.ACTIVE, ComplianceStatus.EXPIRING_SOON],
        },
        $or: [
          {
            issueDate: { $lte: reportData.expiryDate },
            expiryDate: { $gte: reportData.issueDate },
          },
        ],
        deletedAt: null,
      });

      if (overlapping) {
        return createErrorResponse(
          "An active compliance report of this category already exists for this property within the requested validity period",
          409
        );
      }

      // ─── Create compliance report ───────────────────────────────────────
      const report = new ComplianceReport({
        ...reportData,
        createdBy: creatorId,
        // status is auto-derived from expiryDate by the pre-save hook;
        // reportData.status (from validation) takes precedence if explicitly set
        status: reportData.status || ComplianceStatus.ACTIVE,
      });

      try {
        await report.save();
      } catch (saveErr: any) {
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
        "Compliance report created successfully"
      );
    } catch (error) {
      console.error("[POST /api/compliance]", error);
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/compliance - Bulk update (admin only)
// ============================================================================

export const PUT = withRoleAndDB([UserRole.ADMIN])(
  async (_user: any, request: NextRequest) => {
    try {
      const { success, data: body } = await parseRequestBody(request);
      if (!success) return createErrorResponse("Invalid request body", 400);

      const validation = validateSchema(complianceBulkUpdateSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const { reportIds, updates } = validation.data;

      // Prevent mutation of critical identifiers
      const safeUpdates: Record<string, any> = { ...updates };
      const protectedFields = [
        "_id",
        "propertyId",
        "createdBy",
        "createdAt",
        "updatedAt",
      ];
      protectedFields.forEach((field) => delete safeUpdates[field]);

      // Bail if nothing left to update after stripping protected fields
      if (Object.keys(safeUpdates).length === 0) {
        return createErrorResponse(
          "No valid fields to update after removing protected identifiers",
          400
        );
      }

      const result = await ComplianceReport.updateMany(
        { _id: { $in: reportIds }, deletedAt: null },
        { $set: safeUpdates }
      );

      return createSuccessResponse(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        `${result.modifiedCount} compliance report(s) updated successfully`
      );
    } catch (error) {
      console.error("[PUT /api/compliance]", error);
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/compliance?ids=1,2,3
// Bulk soft-delete (admin only)
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN])(
  async (_user: any, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const ids =
        searchParams
          .get("ids")
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) || [];

      if (ids.length === 0) {
        return createErrorResponse(
          "No valid report IDs provided in ?ids=",
          400
        );
      }

      // Prevent deleting active certificates - they should be revoked first
      const activeCount = await ComplianceReport.countDocuments({
        _id: { $in: ids },
        status: {
          $in: [ComplianceStatus.ACTIVE, ComplianceStatus.EXPIRING_SOON],
        },
        deletedAt: null,
      });

      if (activeCount > 0) {
        return createErrorResponse(
          "Cannot delete active compliance reports. Revoke them first.",
          409
        );
      }

      const result = await ComplianceReport.updateMany(
        { _id: { $in: ids }, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      );

      return createSuccessResponse(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        `${result.modifiedCount} compliance report(s) soft-deleted`
      );
    } catch (error) {
      console.error("[DELETE /api/compliance]", error);
      return handleApiError(error);
    }
  }
);