/**
 * PropertyPro - Lease Statistics API Route
 * Get lease statistics and metrics
 */

import { NextRequest } from "next/server";
import { Lease } from "@/models";
import { UserRole, LeaseStatus } from "@/types";
import { applyDerivedPropertyScope } from "@/lib/auth/property-scope";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";

// ============================================================================
// GET /api/leases/stats - Get lease statistics
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
])(async (user, request: NextRequest) => {
  try {
    // Build base query based on user role.
    // `deletedAt` must be set explicitly: these are countDocuments calls, which
    // do not match the model's pre(/^find/) soft-delete hook, so without it the
    // stat cards counted deleted leases the list itself never shows.
    let baseQuery: any = { deletedAt: null };

    // Role-based filtering for single company architecture
    if (user.role === UserRole.TENANT) {
      // For tenant users, filter leases by their user ID directly
      baseQuery.tenantId = user.id;
    } else {
      // Restrict to the caller's properties. These are countDocuments calls,
      // which bypass the model's pre-find hook entirely — the scope has to be
      // in the query object itself, as deletedAt already is.
      await applyDerivedPropertyScope(baseQuery, user);
    }

    // Get total count by status
    const [
      total,
      active,
      draft,
      pending,
      expired,
      terminated,
      expiringThisMonth,
    ] = await Promise.all([
      Lease.countDocuments(baseQuery),
      Lease.countDocuments({ ...baseQuery, status: LeaseStatus.ACTIVE }),
      Lease.countDocuments({ ...baseQuery, status: LeaseStatus.DRAFT }),
      Lease.countDocuments({ ...baseQuery, status: LeaseStatus.PENDING }),
      Lease.countDocuments({ ...baseQuery, status: LeaseStatus.EXPIRED }),
      Lease.countDocuments({ ...baseQuery, status: LeaseStatus.TERMINATED }),
      // Count leases expiring this month
      Lease.countDocuments({
        ...baseQuery,
        status: LeaseStatus.ACTIVE,
        endDate: {
          $gte: new Date(),
          $lte: new Date(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            0
          ),
        },
      }),
    ]);

    const stats = {
      total,
      active,
      draft,
      pending,
      expired,
      terminated,
      expiringThisMonth,
    };

    return createSuccessResponse(stats, "Lease statistics retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
});

