/**
 * PropertyPro - Leases API Routes
 * CRUD operations for lease management.
 *
 * Routes:
 *   GET    /api/leases           → List leases (paginated, filtered)
 *   POST   /api/leases           → Create new lease
 *   PUT    /api/leases           → Bulk update leases (admin only)
 *   DELETE /api/leases?ids=...   → Bulk soft-delete leases (admin only)
 *
 * Rent period notes:
 *   - `rentPeriod` is "month" | "week" | "day" (see leaseSchema).
 *   - `startDate` is always required; `endDate` is optional for every period,
 *     but required by leaseSchema's superRefine when rentPeriod is "week" or
 *     "day" (bounded tenancies). Month leases may be open-ended (endDate
 *     null).
 *   - Overlap checks and the unit's "occupied" flag apply the same way
 *     regardless of rentPeriod: an open-ended (Month) lease is treated as
 *     extending indefinitely for overlap purposes.
 *   - Unit occupancy (`units.$.status`, `currentTenantId`, `currentLeaseId`)
 *     is maintained by the Lease model's own `post("save")` hook — this
 *     route does not duplicate that update.
 */

import { NextRequest } from "next/server";
import { Lease, Property, User } from "@/models";
import { UserRole, LeaseStatus } from "@/types";
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
  leaseSchema,
  paginationSchema,
  validateSchema,
} from "@/lib/validations";
import { autoInvoiceGenerationService } from "@/lib/services/auto-invoice-generation.service";

// ============================================================================
// GET /api/leases
// List leases with pagination, filtering, search, and population
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
])(async (user: any, request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const paginationParams = parsePaginationParams(searchParams);

    // Lease-specific filters
    const status     = searchParams.get("status") || undefined;
    const propertyId = searchParams.get("propertyId") || undefined;
    const tenantId   = searchParams.get("tenantId") || undefined;
    const expiring   = searchParams.get("expiring") || undefined;
    const rentPeriod = searchParams.get("rentPeriod") || undefined; // month / week / day
    // History view: `deleted=true` returns only soft-deleted leases.
    const deleted    = searchParams.get("deleted") === "true";

    const validation = validateSchema(paginationSchema, paginationParams);
    if (!validation.success) {
      return createErrorResponse(validation.errors.join(", "), 400);
    }

    const filters = validation.data;

    // Base query. Naming deletedAt explicitly also opts out of the model's
    // default soft-delete filter, which is what makes the history view possible.
    const query: any = deleted
      ? { deletedAt: { $ne: null } }
      : { deletedAt: null };

    // Tenant restriction
    if (user.role === UserRole.TENANT) {
      query.tenantId = user.id;
    }

    // Applied filters
    if (status)     query.status = status;
    if (propertyId) query.propertyId = propertyId;
    if (tenantId)   query.tenantId = tenantId;
    if (rentPeriod) query.rentPeriod = rentPeriod;

    // Expiring soon filter — only ever matches bounded leases (endDate set);
    // open-ended Month leases have no endDate and are correctly excluded.
    if (expiring) {
      const days = parseInt(expiring) || 30;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      query.status = LeaseStatus.ACTIVE;
      query.endDate = { $lte: futureDate };
    }

    // Text search preparation
    let searchRegex: RegExp | null = null;
    if (filters.search && typeof filters.search === "string" && filters.search.trim()) {
      const term = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      searchRegex = new RegExp(term, "i");
    }

    // Execute paginated query
    const result = await paginateQuery(Lease, query, filters);

    // Populate relations
    const populated = await Lease.populate(result.data, [
      {
        path: "propertyId",
        select: "name address type isMultiUnit totalUnits units",
      },
      {
        path: "tenantId",
        select: "firstName lastName email phone avatar tenantStatus",
      },
    ]);

    // Post-process: filter + enrich with unit data
    const processedLeases = populated
      .filter((lease: any) => lease.tenantId !== null) // remove orphaned
      .filter((lease: any) => {
        if (!searchRegex) return true;

        const tenant = lease.tenantId || {};
        const prop = lease.propertyId || {};
        const unit =
          prop.units?.find(
            (u: any) => u._id?.toString() === lease.unitId?.toString()
          ) || {};

        const searchable = [
          `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim(),
          tenant.email || "",
          tenant.phone || "",
          prop.name || "",
          prop.address?.street || "",
          prop.address?.city || "",
          prop.address?.state || "",
          lease._id?.toString() || "",
          lease.notes || "",
          unit.unitNumber || "",
          unit.unitType || "",
          lease.rentPeriod || "",
        ];

        return searchable.some((val) => searchRegex!.test(val));
      })
      .map((lease: any) => {
        if (
          lease.propertyId &&
          typeof lease.propertyId === "object" &&
          "units" in lease.propertyId &&
          lease.unitId
        ) {
          const unit = (lease.propertyId as any).units.find(
            (u: any) => u._id?.toString() === lease.unitId?.toString()
          );
          if (unit) {
            (lease as any).unit = unit; // virtual unit object
          }
        }
        return lease;
      });

    // `result.pagination.total` is the countDocuments total across every page.
    // It used to be overwritten with processedLeases.length — the row count of
    // the current page only — which capped the reported total at the page size
    // and contradicted totalPages (page 1 of 15 records reported "12 total"
    // while still claiming 2 pages). The post-processing above can drop orphan
    // rows from a page, but that is a data-integrity problem to fix at the
    // source, not a reason to misreport the total.
    return createSuccessResponse(
      processedLeases,
      "Leases retrieved successfully",
      result.pagination
    );
  } catch (error) {
    return handleApiError(error);
  }
});

// ============================================================================
// POST /api/leases
// Create new lease
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user: any, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error || "Invalid request body", 400);
      }

      // leaseSchema already enforces: rentAmount required/positive, endDate
      // required (and after startDate) for Week/Day, endDate optional for
      // Month. No need to re-derive any of that here.
      const validation = validateSchema(leaseSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const leaseData = validation.data as any;

      // ─── Existence & authorization checks ───────────────────────────────
      const property = await Property.findById(leaseData.propertyId);
      if (!property) return createErrorResponse("Property not found", 404);

      const unit = property.units.find(
        (u: any) => u._id?.toString() === leaseData.unitId?.toString()
      );
      if (!unit) return createErrorResponse("Unit not found in this property", 404);

      const tenant = await User.findOne({
        _id: leaseData.tenantId,
        role: UserRole.TENANT,
      });
      if (!tenant) return createErrorResponse("Tenant not found", 404);
      if (!["approved", "active"].includes(tenant.tenantStatus || "")) {
        return createErrorResponse("Tenant must be approved or active", 400);
      }

      // ─── Unit availability ──────────────────────────────────────────────
      if (unit.status !== "available") {
        return createErrorResponse("Unit is not available for leasing", 400);
      }

      const overlapQuery: any = {
        propertyId: leaseData.propertyId,
        unitId: leaseData.unitId,
        status: { $in: [LeaseStatus.ACTIVE, LeaseStatus.PENDING, LeaseStatus.DRAFT] },
        deletedAt: null,
        $or: [
          { endDate: { $gte: leaseData.startDate } },
          { endDate: { $exists: false } },
          { endDate: null },
        ],
      };
      if (leaseData.endDate) {
        overlapQuery.startDate = { $lte: leaseData.endDate };
      }

      const overlapping = await Lease.findOne(overlapQuery);
      if (overlapping) {
        return createErrorResponse(
          "Lease dates overlap with an existing lease on this unit",
          409
        );
      }

      // ─── Create lease document ──────────────────────────────────────────
      const terms = (leaseData.terms ?? {}) as any;
      const lease = new Lease({
        ...leaseData,
        terms: {
          ...terms,
          paymentConfig: {
            ...(terms.paymentConfig || {}),
            lateFeeConfig: {
              enabled: Number(terms.lateFee || 0) > 0,
              feeAmount: Number(terms.lateFee || 0),
              gracePeriodDays: Number(terms.paymentConfig?.lateFeeConfig?.gracePeriodDays || 5),
              feeType: terms.paymentConfig?.lateFeeConfig?.feeType || "fixed",
              ...(terms.paymentConfig?.lateFeeConfig || {}),
            },
            rentDueDay: Number(terms.paymentConfig?.rentDueDay || 1),
            autoGenerateInvoices: !!terms.paymentConfig?.autoGenerateInvoices,
            autoEmailInvoices: !!terms.paymentConfig?.autoEmailInvoices,
          },
        },
        status: leaseData.status || LeaseStatus.DRAFT,
      });

      // Unit occupancy (status/currentTenantId/currentLeaseId) is set by the
      // Lease model's post("save") hook — no manual Property update needed.
      await lease.save();

      // ─── Populate response data ─────────────────────────────────────────
      await lease.populate([
        {
          path: "propertyId",
          select: "name address type isMultiUnit totalUnits units",
        },
        {
          path: "tenantId",
          select: "firstName lastName email phone avatar tenantStatus",
        },
      ]);

      if (lease.propertyId?.units && lease.unitId) {
        const unitInfo = lease.propertyId.units.find(
          (u: any) => u._id?.toString() === lease.unitId?.toString()
        );
        if (unitInfo) (lease as any).unit = unitInfo;
      }

      // ─── Auto-generate invoices (non-blocking) ──────────────────────────
      let invoiceGeneration = null;

      if (
        lease.status === LeaseStatus.ACTIVE &&
        lease.terms?.paymentConfig?.autoGenerateInvoices
      ) {
        try {
          invoiceGeneration =
            await autoInvoiceGenerationService.generateInvoicesForLease(
              lease._id.toString(),
              {
                generateOnLeaseCreation: true,
                generateSecurityDeposit: lease.terms.securityDeposit > 0,
                advanceMonths: lease.terms.paymentConfig?.advancePaymentMonths || 0,
                autoIssue: true,
                autoEmail: lease.terms.paymentConfig?.autoEmailInvoices || false,
              }
            );
        } catch (err) {
          console.error("[Lease Creation] Invoice generation failed (non-blocking)", err);
        }
      }

      return createSuccessResponse(
        {
          lease,
          invoiceGeneration,
        },
        "Lease created successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/leases - Bulk update (admin only)
// ============================================================================

export const PUT = withRoleAndDB([UserRole.ADMIN])(
  async (_, request: NextRequest) => {
    try {
      const { success, data: body } = await parseRequestBody(request);
      if (!success) return createErrorResponse("Invalid request body", 400);

      const { leaseIds, updates } = body;

      if (!Array.isArray(leaseIds) || leaseIds.length === 0) {
        return createErrorResponse("leaseIds array is required", 400);
      }

      if (!updates || typeof updates !== "object") {
        return createErrorResponse("updates object is required", 400);
      }

      // Prevent mutation of critical identifiers
      const safeUpdates = { ...updates };
      const protectedFields = ["_id", "propertyId", "unitId", "tenantId", "createdAt", "updatedAt"];
      protectedFields.forEach((field) => delete safeUpdates[field]);

      const result = await Lease.updateMany(
        { _id: { $in: leaseIds }, deletedAt: null },
        { $set: safeUpdates }
      );

      return createSuccessResponse(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        `${result.modifiedCount} lease(s) updated successfully`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/leases?ids=1,2,3
// Bulk soft-delete (admin only)
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN])(
  async (_, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const ids =
        searchParams.get("ids")?.split(",").map((id) => id.trim()).filter(Boolean) || [];

      if (ids.length === 0) {
        return createErrorResponse("No valid lease IDs provided in ?ids=", 400);
      }

      // Prevent deleting active leases
      const activeCount = await Lease.countDocuments({
        _id: { $in: ids },
        status: LeaseStatus.ACTIVE,
        deletedAt: null,
      });

      if (activeCount > 0) {
        return createErrorResponse(
          "Cannot delete active leases. Terminate them first.",
          409
        );
      }

      const result = await Lease.updateMany(
        { _id: { $in: ids }, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      );

      return createSuccessResponse(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        `${result.modifiedCount} lease(s) soft-deleted`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);