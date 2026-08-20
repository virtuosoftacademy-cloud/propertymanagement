/**
 * PropertyPro - Dashboard Data Export API
 * Exports dashboard data in various formats
 */

import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { UserRole } from "@/types";
import { NextRequest } from "next/server";
import { Property, Lease, User, MaintenanceRequest, Payment } from "@/models";
import { formatCurrency } from "@/lib/utils/formatting";
import { applyPropertyScope, applyDerivedPropertyScope } from "@/lib/auth/property-scope";

export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  // The first parameter of a withRoleAndDB handler is the USER, not the
  // request. This was declared as `(request: NextRequest)`, so `request.json()`
  // ran against the user object and threw — this endpoint has never worked.
  async (user, request: NextRequest) => {
    try {
      const {
        format = "json",
        dateRange,
        includeDetails = false,
      } = await request.json();

      const now = new Date();
      const startDate = dateRange?.start
        ? new Date(dateRange.start)
        : new Date(now.getFullYear(), 0, 1);
      const endDate = dateRange?.end ? new Date(dateRange.end) : now;

      // Scope every collection to the caller's properties before exporting —
      // this endpoint writes the result to a file, so an unscoped read hands a
      // manager the entire portfolio.
      const propertyQuery: any = { deletedAt: null };
      applyPropertyScope(propertyQuery, user);

      // Shared by every property-derived collection below (leases,
      // maintenance, payments) — same shape, same scope.
      const derivedQuery: any = {
        deletedAt: null,
        createdAt: { $gte: startDate, $lte: endDate },
      };
      await applyDerivedPropertyScope(derivedQuery, user);

      // Fetch dashboard data
      const [properties, leases, tenants, maintenance, payments] =
        await Promise.all([
          Property.find(propertyQuery)
            .select(
              includeDetails ? undefined : "name type totalUnits rentAmount"
            )
            .lean(),
          Lease.find({ ...derivedQuery })
            .select(
              includeDetails
                ? undefined
                : "status startDate endDate monthlyRent"
            )
            .populate(
              includeDetails
                ? [
                  { path: "tenantId", select: "firstName lastName email" },
                  { path: "propertyId", select: "name" },
                ]
                : []
            )
            .lean(),
          User.find({
            role: UserRole.TENANT,
            deletedAt: null,
            createdAt: { $gte: startDate, $lte: endDate },
          })
            .select(
              includeDetails
                ? undefined
                : "firstName lastName email tenantStatus"
            )
            .lean(),
          MaintenanceRequest.find({ ...derivedQuery })
            .select(
              includeDetails
                ? undefined
                : "title status priority estimatedCost actualCost"
            )
            .populate(
              includeDetails ? [{ path: "propertyId", select: "name" }] : []
            )
            .lean(),
          Payment.find({ ...derivedQuery })
            .select(
              includeDetails ? undefined : "amount status type paidDate dueDate"
            )
            .populate(
              includeDetails
                ? [
                  { path: "tenantId", select: "firstName lastName" },
                  { path: "propertyId", select: "name" },
                ]
                : []
            )
            .lean(),
        ]);

      // Calculate summary metrics
      const summary = {
        totalProperties: properties.length,
        totalUnits: properties.reduce((sum, p) => sum + (p.totalUnits || 1), 0),
        totalTenants: tenants.length,
        activeTenants: tenants.filter((t) => t.tenantStatus === "active")
          .length,
        totalLeases: leases.length,
        activeLeases: leases.filter((l) => l.status === "active").length,
        totalMaintenance: maintenance.length,
        openMaintenance: maintenance.filter((m) =>
          ["submitted", "assigned"].includes(m.status)
        ).length,
        totalPayments: payments.length,
        paidPayments: payments.filter((p) =>
          ["paid", "completed"].includes(p.status)
        ).length,
        totalRevenue: payments
          .filter((p) => ["paid", "completed"].includes(p.status))
          .reduce((sum, p) => sum + (p.amount || 0), 0),
        totalMaintenanceCost: maintenance.reduce(
          (sum, m) => sum + (m.actualCost || m.estimatedCost || 0),
          0
        ),
      };

      const exportData = {
        generatedAt: now.toISOString(),
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        summary,
        data: includeDetails
          ? {
            properties,
            leases,
            tenants,
            maintenance,
            payments,
          }
          : {
            propertyCount: properties.length,
            leaseCount: leases.length,
            tenantCount: tenants.length,
            maintenanceCount: maintenance.length,
            paymentCount: payments.length,
          },
      };
      const safeExportData = JSON.parse(JSON.stringify(exportData))

      if (format === "csv") {
        // Convert to CSV format for summary data
        const csvData = [
          ["Metric", "Value"],
          ["Total Properties", summary.totalProperties],
          ["Total Units", summary.totalUnits],
          ["Total Tenants", summary.totalTenants],
          ["Active Tenants", summary.activeTenants],
          ["Total Leases", summary.totalLeases],
          ["Active Leases", summary.activeLeases],
          ["Total Maintenance", summary.totalMaintenance],
          ["Open Maintenance", summary.openMaintenance],
          ["Total Payments", summary.totalPayments],
          ["Paid Payments", summary.paidPayments],
          ["Total Revenue", formatCurrency(summary.totalRevenue)],
          ["Maintenance Cost", formatCurrency(summary.totalMaintenanceCost)],
        ];

        const csvContent = csvData.map((row) => row.join(",")).join("\n");

        return new Response(csvContent, {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="dashboard-export-${now.toISOString().split("T")[0]
              }.csv"`,
          },
        });
      }

      return createSuccessResponse(
        safeExportData,
        "Dashboard data exported successfully"
      );
    } catch (error) {
      return handleApiError(error ?? "Failed to export dashboard data");
    }
  }
);
