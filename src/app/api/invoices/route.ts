/**
 * PropertyPro - Invoices list API
 *
 * GET /api/invoices was a byte-for-byte duplicate of /api/analytics/route.ts
 * (same 1166 lines, same content) — a copy-paste-and-forgot-to-rename mistake
 * that shadowed the path every invoice-list page actually calls. Nothing here
 * ever queried the Invoice model, so `/api/invoices` returned portfolio/
 * occupancy/financial analytics instead of invoices, and every page reading
 * `result.data?.invoices` silently got `undefined` → an empty list. The real
 * analytics logic already lives at /api/analytics, used by the dashboard
 * pages that actually want it — nothing was lost by replacing this file.
 *
 * Five places call this path and expect `{ data: { invoices, pagination } }`:
 * the invoice list page, invoice history page, the overdue-payments page,
 * TenantInvoiceHistory, and PaymentStatusDashboard (the last of those read
 * `data` as a bare array — also broken, and fixed alongside this).
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { Invoice } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { applyDerivedPropertyScope } from "@/lib/auth/property-scope";

const TENANT_POPULATE = "firstName lastName email phone avatar";
const PROPERTY_POPULATE = "name address";

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
])(async (user, request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    // Capped, not just parsed: the main invoices page deliberately asks for
    // limit=1000 to page and sort client-side, so the cap has to sit above
    // that rather than at the usual 100.
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "12")),
      1000
    );
    const search = (searchParams.get("search") || "").trim();
    const status = searchParams.get("status") || undefined;
    const propertyId = searchParams.get("propertyId") || undefined;
    const tenantId = searchParams.get("tenantId") || undefined;
    const leaseId = searchParams.get("leaseId") || undefined;
    const unitId = searchParams.get("unitId") || undefined;
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

    // History view: `deleted=true` returns only soft-deleted invoices, same
    // opt-out-of-the-hook convention as leases and users.
    const deleted = searchParams.get("deleted") === "true";
    const deletedFrom = searchParams.get("deletedFrom") || undefined;
    const deletedTo = searchParams.get("deletedTo") || undefined;

    const query: any = deleted
      ? { deletedAt: { $ne: null } }
      : { deletedAt: null };

    if (deleted && (deletedFrom || deletedTo)) {
      const range: any = { $ne: null };
      if (deletedFrom) {
        const from = new Date(deletedFrom);
        if (!Number.isNaN(from.getTime())) range.$gte = from;
      }
      if (deletedTo) {
        const to = new Date(deletedTo);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          range.$lte = to;
        }
      }
      query.deletedAt = range;
    }

    // Tenants see only their own invoices — the filter is forced, not merely
    // defaulted, so a tenant cannot read anyone else's by passing ?tenantId=.
    if (user.role === UserRole.TENANT) {
      query.tenantId = user.id;
    } else {
      if (tenantId) query.tenantId = tenantId;
      // Scope to the caller's own properties, honouring an explicit
      // propertyId if it is actually within scope.
      if (propertyId) query.propertyId = propertyId;
      await applyDerivedPropertyScope(query, user);
    }

    if (status && status !== "all") query.status = status;
    if (leaseId) {
      if (!mongoose.Types.ObjectId.isValid(leaseId)) {
        return createErrorResponse("Invalid lease ID", 400);
      }
      query.leaseId = new mongoose.Types.ObjectId(leaseId);
    }
    if (unitId) {
      if (!mongoose.Types.ObjectId.isValid(unitId)) {
        return createErrorResponse("Invalid unit ID", 400);
      }
      query.unitId = new mongoose.Types.ObjectId(unitId);
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder };

    let invoices: any[];
    let total: number;

    if (search) {
      // Plain find() cannot regex-match populated fields, so searching by
      // tenant name or property name needs the join done in the query itself
      // — same technique already used for payments.
      const term = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: "users",
            localField: "tenantId",
            foreignField: "_id",
            as: "tenantId",
          },
        },
        { $unwind: { path: "$tenantId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "properties",
            localField: "propertyId",
            foreignField: "_id",
            as: "propertyId",
          },
        },
        { $unwind: { path: "$propertyId", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { invoiceNumber: { $regex: term, $options: "i" } },
              { "tenantId.firstName": { $regex: term, $options: "i" } },
              { "tenantId.lastName": { $regex: term, $options: "i" } },
              { "tenantId.email": { $regex: term, $options: "i" } },
              { "propertyId.name": { $regex: term, $options: "i" } },
            ],
          },
        },
        { $sort: sort },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            metadata: [{ $count: "total" }],
          },
        },
      ];

      const [agg] = await Invoice.aggregate(pipeline);
      invoices = agg?.data ?? [];
      total = agg?.metadata?.[0]?.total ?? 0;
    } else {
      const [docs, count] = await Promise.all([
        Invoice.find(query)
          .populate("tenantId", TENANT_POPULATE)
          .populate("propertyId", PROPERTY_POPULATE)
          .populate({
            path: "leaseId",
            select: "startDate endDate terms propertyId",
            populate: { path: "propertyId", select: PROPERTY_POPULATE },
          })
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Invoice.countDocuments(query),
      ]);
      invoices = docs;
      total = count;
    }

    const pages = Math.max(1, Math.ceil(total / limit));

    return createSuccessResponse(
      {
        invoices,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      },
      "Invoices retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});
