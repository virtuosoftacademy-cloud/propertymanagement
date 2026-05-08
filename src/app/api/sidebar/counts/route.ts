/**
 * PropertyPro - Sidebar Counts API
 * Provides real-time counts for sidebar navigation badges
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { User, Lease, MaintenanceRequest, Payment } from "@/models";
import {
  UserRole,
  LeaseStatus,
  MaintenancePriority,
  MaintenanceStatus,
  PaymentStatus,
} from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";

// ============================================================================
// GET /api/sidebar/counts - Get sidebar navigation counts
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
])(async (user, request: NextRequest) => {
  try {
    const userRole = user.role as UserRole;

    // Initialize counts object
    const counts = {
      applications: 0,
      expiringLeases: 0,
      emergencyMaintenance: 0,
      overduePayments: 0,
    };

    // Role-based count fetching - Single company architecture
    if ([UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      // Applications count - users with pending application status
      const applicationsCount = await User.countDocuments({
        role: UserRole.TENANT,
        tenantStatus: { $in: ["application_submitted", "under_review"] },
        isActive: true,
        deletedAt: null,
      });
      counts.applications = applicationsCount;
    }

    if ([UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      // Expiring leases count - leases expiring in next 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      let leaseQuery: any = {
        status: LeaseStatus.ACTIVE,
        endDate: {
          $gte: new Date(),
          $lte: thirtyDaysFromNow,
        },
        deletedAt: null,
      };

      // Single company - no role-based filtering needed for leases

      const expiringLeasesCount = await Lease.countDocuments(leaseQuery);
      counts.expiringLeases = expiringLeasesCount;
    }

    if ([UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      // Emergency maintenance count - emergency priority requests that are not completed/cancelled
      let maintenanceQuery: any = {
        priority: MaintenancePriority.EMERGENCY,
        status: {
          $nin: [MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED],
        },
        deletedAt: null,
      };

      // Single company - all maintenance requests visible to admin/manager

      const emergencyMaintenanceCount = await MaintenanceRequest.countDocuments(
        maintenanceQuery
      );
      counts.emergencyMaintenance = emergencyMaintenanceCount;
    }

    if ([UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      // Overdue payments count
      let paymentQuery: any = {
        status: PaymentStatus.OVERDUE,
        deletedAt: null,
      };

      // Single company - no role-based filtering needed for payments

      const overduePaymentsCount = await Payment.countDocuments(paymentQuery);
      counts.overduePayments = overduePaymentsCount;
    }

    return createSuccessResponse(
      counts,
      "Sidebar counts retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});
