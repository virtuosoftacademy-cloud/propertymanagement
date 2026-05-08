/**
 * PropertyPro - Portfolio Dashboard Overview API
 * Aggregates cross-domain metrics for the manager/owner dashboard
 */

import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import {
  UserRole,
  LeaseStatus,
  MaintenanceStatus,
  MaintenancePriority,
  PaymentStatus,
  EventStatus,
  EventPriority,
  EventType,
} from "@/types";
import {
  Property,
  Lease,
  User,
  MaintenanceRequest,
  Payment,
  Event,
} from "@/models";
import { DashboardOverviewResponse } from "@/types/dashboard";

const ALERT_COLOR_MAP = ["#0ea5e9", "#22c55e", "#f97316", "#ef4444", "#8b5cf6"];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const twelveMonthsAgo = new Date(
        now.getFullYear(),
        now.getMonth() - 11,
        1
      );
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000
      );

      // -----------------------------------------------------------------------
      // Core portfolio information (properties, units, rent distribution)
      // -----------------------------------------------------------------------
      const properties = await Property.find({ deletedAt: null })
        .select("type totalUnits units rentAmount isMultiUnit")
        .lean();

      const totalProperties = properties.length;

      let totalUnits = 0;
      let occupiedUnits = 0;
      let totalRent = 0;
      let rentSampleCount = 0;

      const propertyTypeCounts: Record<string, number> = {};

      for (const property of properties) {
        const unitsCount = property?.isMultiUnit
          ? property?.units?.length || property?.totalUnits || 1
          : 1;

        totalUnits += unitsCount;

        propertyTypeCounts[property?.type ?? "unknown"] =
          (propertyTypeCounts[property?.type ?? "unknown"] || 0) + 1;

        if (property?.isMultiUnit && property?.units?.length) {
          for (const unit of property.units) {
            if (
              typeof unit?.rentAmount === "number" &&
              (unit?.rentAmount ?? 0) > 0
            ) {
              totalRent += unit.rentAmount;
              rentSampleCount += 1;
            }
          }
        }
        // Note: rentAmount is now only stored in units, no fallback to property-level
      }

      const averageRent = rentSampleCount > 0 ? totalRent / rentSampleCount : 0;

      // -----------------------------------------------------------------------
      // Lease and tenant metrics
      // -----------------------------------------------------------------------
      const [activeLeasesCount, expiringLeasesCount, tenantStatusBuckets] =
        await Promise.all([
          Lease.countDocuments({
            status: LeaseStatus.ACTIVE,
            deletedAt: null,
          }),
          Lease.countDocuments({
            status: LeaseStatus.ACTIVE,
            endDate: { $gte: now, $lte: thirtyDaysFromNow },
            deletedAt: null,
          }),
          User.aggregate([
            {
              $match: {
                role: UserRole.TENANT,
                deletedAt: null,
              },
            },
            {
              $group: {
                _id: "$tenantStatus",
                count: { $sum: 1 },
              },
            },
          ]),
        ]);

      occupiedUnits = activeLeasesCount;

      const tenantStatusMap = tenantStatusBuckets.reduce<
        Record<string, number>
      >((acc, bucket) => {
        acc[bucket?._id || "unknown"] = bucket?.count ?? 0;
        return acc;
      }, {});

      const totalTenants = Object.values(tenantStatusMap).reduce(
        (sum, current) => sum + current,
        0
      );
      const activeTenants = tenantStatusMap["active"] || 0;
      const pendingApplications =
        (tenantStatusMap["application_submitted"] || 0) +
        (tenantStatusMap["under_review"] || 0);

      const occupancyRate =
        totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      // -----------------------------------------------------------------------
      // Maintenance metrics
      // -----------------------------------------------------------------------
      const maintenanceBuckets = await MaintenanceRequest.aggregate([
        {
          $match: {
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [MaintenanceStatus.SUBMITTED, MaintenanceStatus.ASSIGNED],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            inProgress: {
              $sum: {
                $cond: [
                  { $eq: ["$status", MaintenanceStatus.IN_PROGRESS] },
                  1,
                  0,
                ],
              },
            },
            completed: {
              $sum: {
                $cond: [
                  { $eq: ["$status", MaintenanceStatus.COMPLETED] },
                  1,
                  0,
                ],
              },
            },
            urgent: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$priority",
                      [MaintenancePriority.HIGH, MaintenancePriority.EMERGENCY],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const maintenanceStats = maintenanceBuckets[0] || {
        total: 0,
        open: 0,
        inProgress: 0,
        completed: 0,
        urgent: 0,
      };

      // -----------------------------------------------------------------------
      // Payment metrics (collection, overdue, trends)
      // -----------------------------------------------------------------------
      // Calculate grace period threshold (5 days ago)
      const gracePeriodThreshold = new Date(now);
      gracePeriodThreshold.setDate(gracePeriodThreshold.getDate() - 5);

      const paymentStats = await Payment.aggregate([
        {
          $match: {
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: null,
            collected: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [PaymentStatus.PAID, PaymentStatus.COMPLETED],
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            collectedCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [PaymentStatus.PAID, PaymentStatus.COMPLETED],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            pending: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [
                        PaymentStatus.PENDING,
                        PaymentStatus.PROCESSING,
                        PaymentStatus.DUE_SOON,
                        PaymentStatus.DUE_TODAY,
                        PaymentStatus.GRACE_PERIOD,
                      ],
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            pendingCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [
                        PaymentStatus.PENDING,
                        PaymentStatus.PROCESSING,
                        PaymentStatus.DUE_SOON,
                        PaymentStatus.DUE_TODAY,
                        PaymentStatus.GRACE_PERIOD,
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      // Check status
                      {
                        $in: [
                          "$status",
                          [
                            PaymentStatus.OVERDUE,
                            PaymentStatus.LATE,
                            PaymentStatus.SEVERELY_OVERDUE,
                          ],
                        ],
                      },
                      // OR check if due date is past grace period and not paid
                      {
                        $and: [
                          {
                            $not: {
                              $in: [
                                "$status",
                                [PaymentStatus.PAID, PaymentStatus.COMPLETED],
                              ],
                            },
                          },
                          { $lt: ["$dueDate", gracePeriodThreshold] },
                        ],
                      },
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
            overdueCount: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      // Check status
                      {
                        $in: [
                          "$status",
                          [
                            PaymentStatus.OVERDUE,
                            PaymentStatus.LATE,
                            PaymentStatus.SEVERELY_OVERDUE,
                          ],
                        ],
                      },
                      // OR check if due date is past grace period and not paid
                      {
                        $and: [
                          {
                            $not: {
                              $in: [
                                "$status",
                                [PaymentStatus.PAID, PaymentStatus.COMPLETED],
                              ],
                            },
                          },
                          { $lt: ["$dueDate", gracePeriodThreshold] },
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalDue: { $sum: "$amount" },
          },
        },
      ]);

      const paymentSummary = paymentStats[0] || {
        collected: 0,
        collectedCount: 0,
        pending: 0,
        pendingCount: 0,
        overdue: 0,
        overdueCount: 0,
        totalDue: 0,
      };

      const collectionRate =
        paymentSummary.totalDue > 0
          ? (paymentSummary.collected / paymentSummary.totalDue) * 100
          : 0;

      const monthlyRevenueAgg = await Payment.aggregate([
        {
          $match: {
            deletedAt: null,
            status: { $in: [PaymentStatus.PAID, PaymentStatus.COMPLETED] },
            $expr: {
              $and: [
                {
                  $gte: [{ $ifNull: ["$paidDate", "$dueDate"] }, startOfMonth],
                },
                {
                  $lte: [{ $ifNull: ["$paidDate", "$dueDate"] }, now],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      const yearlyRevenueAgg = await Payment.aggregate([
        {
          $match: {
            deletedAt: null,
            status: { $in: [PaymentStatus.PAID, PaymentStatus.COMPLETED] },
            $expr: {
              $and: [
                {
                  $gte: [{ $ifNull: ["$paidDate", "$dueDate"] }, startOfYear],
                },
                {
                  $lte: [{ $ifNull: ["$paidDate", "$dueDate"] }, now],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0;
      const yearlyRevenue = yearlyRevenueAgg[0]?.total || 0;

      const revenueByMonth = await Payment.aggregate([
        {
          $match: {
            deletedAt: null,
            status: { $in: [PaymentStatus.PAID, PaymentStatus.COMPLETED] },
            $expr: {
              $and: [
                {
                  $gte: [
                    { $ifNull: ["$paidDate", "$dueDate"] },
                    twelveMonthsAgo,
                  ],
                },
                {
                  $lte: [{ $ifNull: ["$paidDate", "$dueDate"] }, now],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              year: {
                $year: { $ifNull: ["$paidDate", "$dueDate"] },
              },
              month: {
                $month: { $ifNull: ["$paidDate", "$dueDate"] },
              },
            },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);

      const maintenanceCostsByMonth = await MaintenanceRequest.aggregate([
        {
          $match: {
            deletedAt: null,
            createdAt: { $gte: twelveMonthsAgo, $lte: now },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            cost: {
              $sum: {
                $ifNull: ["$actualCost", { $ifNull: ["$estimatedCost", 0] }],
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);

      const revenueMap = new Map<string, number>();
      for (const bucket of revenueByMonth) {
        const key = `${bucket._id.year}-${bucket._id.month}`;
        revenueMap.set(key, bucket.total);
      }

      const expenseMap = new Map<string, { cost: number; count: number }>();
      for (const bucket of maintenanceCostsByMonth) {
        const key = `${bucket._id.year}-${bucket._id.month}`;
        expenseMap.set(key, { cost: bucket.cost, count: bucket.count });
      }

      const trendData: DashboardOverviewResponse["trends"]["revenue"] = [];
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const key = `${year}-${monthIndex + 1}`;

        const revenue = revenueMap.get(key) || 0;
        const expenseEntry = expenseMap.get(key) || { cost: 0, count: 0 };
        trendData.push({
          month: MONTH_LABELS[monthIndex],
          totalRevenue: revenue,
          totalExpenses: expenseEntry.cost,
          maintenance: expenseEntry.count,
          occupancy: Math.round(occupancyRate * 10) / 10,
        });
      }

      // -----------------------------------------------------------------------
      // Recent activity feed (payments, maintenance, leases)
      // -----------------------------------------------------------------------
      const [recentPayments, recentMaintenance, recentLeases] =
        await Promise.all([
          Payment.find({ deletedAt: null })
            .sort({ updatedAt: -1 })
            .limit(5)
            .select(
              "amount status type paidDate dueDate updatedAt tenantId propertyId"
            )
            .populate([
              { path: "tenantId", select: "firstName lastName" },
              { path: "propertyId", select: "name" },
            ])
            .lean(),
          MaintenanceRequest.find({ deletedAt: null })
            .sort({ updatedAt: -1 })
            .limit(5)
            .select("title priority status updatedAt propertyId")
            .populate({ path: "propertyId", select: "name" })
            .lean(),
          Lease.find({ deletedAt: null })
            .sort({ updatedAt: -1 })
            .limit(5)
            .select("status startDate endDate updatedAt tenantId propertyId")
            .populate([
              { path: "tenantId", select: "firstName lastName" },
              { path: "propertyId", select: "name" },
            ])
            .lean(),
        ]);

      const formatName = (
        record?:
          | {
              firstName?: string | null;
              lastName?: string | null;
              email?: string | null;
              name?: string | null;
            }
          | string
          | null
      ) => {
        if (!record) return "Unknown";
        if (typeof record === "string") return record;

        const first = record.firstName || record.name || "";
        const last = record.lastName || "";
        return `${first} ${last}`.trim() || record.email || "Unknown";
      };

      const activities: DashboardOverviewResponse["recentActivities"] = [
        ...recentPayments.map((payment) => {
          const tenantName = formatName(payment?.tenantId);
          const propertyName = payment?.propertyId?.name || "Portfolio";
          const description = `${tenantName} paid ${
            payment?.type || "rent"
          } for ${propertyName}`;
          const timestamp =
            payment?.paidDate?.toISOString?.() ||
            payment?.updatedAt?.toISOString?.() ||
            new Date().toISOString();

          return {
            id: payment?._id?.toString() ?? "unknown",
            type: "payment" as const,
            description,
            timestamp,
            status: payment?.status,
            amount: payment?.amount,
          };
        }),
        ...recentMaintenance.map((request) => {
          const propertyName = request?.propertyId?.name || "Portfolio";
          const description = `${
            request?.title || "Maintenance request"
          } at ${propertyName}`;
          const timestamp =
            request?.updatedAt?.toISOString?.() || new Date().toISOString();

          return {
            id: request?._id?.toString() ?? "unknown",
            type: "maintenance" as const,
            description,
            timestamp,
            status: request?.status,
            priority: request?.priority,
          };
        }),
        ...recentLeases.map((lease) => {
          const tenantName = formatName(lease?.tenantId);
          const propertyName = lease?.propertyId?.name || "Portfolio";
          const description = `${tenantName} lease ${
            lease?.status?.replace(/_/g, " ") || "unknown"
          } at ${propertyName}`;
          const timestamp =
            lease?.updatedAt?.toISOString?.() || new Date().toISOString();

          return {
            id: lease?._id?.toString() ?? "unknown",
            type: "lease" as const,
            description,
            timestamp,
            status: lease?.status,
          };
        }),
      ]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 8);

      // -----------------------------------------------------------------------
      // Upcoming tasks (calendar events + expiring lease reminders + open maintenance)
      // -----------------------------------------------------------------------
      const [
        upcomingEvents,
        upcomingExpiringLeases,
        openHighPriorityMaintenance,
      ] = await Promise.all([
        Event.find({
          deletedAt: null,
          status: { $in: [EventStatus.SCHEDULED, EventStatus.CONFIRMED] },
          startDate: { $gte: now },
        })
          .sort({ startDate: 1 })
          .limit(5)
          .select("title startDate priority type")
          .lean(),
        Lease.find({
          status: LeaseStatus.ACTIVE,
          endDate: { $gte: now, $lte: thirtyDaysFromNow },
          deletedAt: null,
        })
          .sort({ endDate: 1 })
          .limit(3)
          .select("endDate tenantId propertyId")
          .populate([
            { path: "tenantId", select: "firstName lastName" },
            { path: "propertyId", select: "name" },
          ])
          .lean(),
        MaintenanceRequest.find({
          deletedAt: null,
          status: {
            $in: [MaintenanceStatus.SUBMITTED, MaintenanceStatus.ASSIGNED],
          },
          priority: {
            $in: [MaintenancePriority.HIGH, MaintenancePriority.EMERGENCY],
          },
        })
          .sort({ createdAt: 1 })
          .limit(3)
          .select("title createdAt priority propertyId")
          .populate({ path: "propertyId", select: "name" })
          .lean(),
      ]);

      const upcomingTasks: DashboardOverviewResponse["upcomingTasks"] = [];

      for (const event of upcomingEvents) {
        upcomingTasks.push({
          id: event?._id?.toString() ?? "unknown",
          title: event?.title ?? "Event",
          dueDate: event?.startDate
            ? new Date(event.startDate).toISOString()
            : now.toISOString(),
          priority: (event?.priority ||
            EventPriority.MEDIUM) as DashboardOverviewResponse["upcomingTasks"][number]["priority"],
          type: event?.type || EventType.GENERAL,
        });
      }

      for (const lease of upcomingExpiringLeases) {
        const tenantName = formatName(lease?.tenantId);
        const propertyName = lease?.propertyId?.name || "Portfolio";
        upcomingTasks.push({
          id: `lease-${lease?._id?.toString() ?? "unknown"}`,
          title: `Lease renewal - ${tenantName} (${propertyName})`,
          dueDate: lease?.endDate?.toISOString?.() || now.toISOString(),
          priority: "high",
          type: "lease_renewal",
        });
      }

      for (const request of openHighPriorityMaintenance) {
        const propertyName = request?.propertyId?.name || "Portfolio";
        upcomingTasks.push({
          id: `maintenance-${request?._id?.toString() ?? "unknown"}`,
          title: `${
            request?.title || "Maintenance follow-up"
          } (${propertyName})`,
          dueDate: request?.createdAt?.toISOString?.() || now.toISOString(),
          priority:
            request?.priority === MaintenancePriority.EMERGENCY
              ? "urgent"
              : "high",
          type: "maintenance",
        });
      }

      upcomingTasks.sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );

      const trimmedTasks = upcomingTasks.slice(0, 8);

      // -----------------------------------------------------------------------
      // Alert summaries
      // -----------------------------------------------------------------------
      // Always show the main 3 alerts (payment, maintenance, lease)
      const mainAlerts: DashboardOverviewResponse["alerts"] = [
        {
          id: "overdue-payments",
          type: "payment",
          title: "Overdue Payments",
          message:
            paymentSummary.overdueCount > 0
              ? `${paymentSummary.overdueCount} tenants have payments overdue by more than 5 days`
              : "No overdue payments at this time",
          severity: paymentSummary.overdue > 0 ? "high" : "low",
          count: paymentSummary.overdueCount,
        },
        {
          id: "urgent-maintenance",
          type: "maintenance",
          title: "Urgent Maintenance",
          message:
            maintenanceStats.urgent > 0
              ? `${maintenanceStats.urgent} urgent maintenance requests require immediate attention`
              : "No urgent maintenance requests",
          severity:
            maintenanceStats.urgent >= 3
              ? "critical"
              : maintenanceStats.urgent > 0
              ? "high"
              : "low",
          count: maintenanceStats.urgent,
        },
        {
          id: "expiring-leases",
          type: "lease",
          title: "Expiring Leases",
          message:
            expiringLeasesCount > 0
              ? `${expiringLeasesCount} leases expiring within the next 30 days`
              : "No leases expiring soon",
          severity: expiringLeasesCount >= 5 ? "medium" : "low",
          count: expiringLeasesCount,
        },
      ];

      // Optional: Add pending applications alert only if there are any
      const alerts: DashboardOverviewResponse["alerts"] = [
        ...mainAlerts,
        ...(pendingApplications > 0
          ? [
              {
                id: "pending-applications",
                type: UserRole.TENANT as DashboardAlertType,
                title: "Pending Applications",
                message: `${pendingApplications} tenant applications awaiting review`,
                severity: "medium" as DashboardAlertSeverity,
                count: pendingApplications,
              },
            ]
          : []),
      ];

      const propertyTypes = Object.entries(propertyTypeCounts).map(
        ([type, count], index) => ({
          name: type
            .split("_")
            .map(
              (segment) => segment.charAt(0).toUpperCase() + segment.slice(1)
            )
            .join(" "),
          value: count,
          color: ALERT_COLOR_MAP[index % ALERT_COLOR_MAP.length],
        })
      );

      const response: DashboardOverviewResponse = {
        overview: {
          totalProperties,
          totalUnits,
          occupiedUnits,
          occupancyRate,
          monthlyRevenue,
          yearlyRevenue,
          averageRent,
          collectionRate,
          totalTenants,
          activeTenants,
          pendingApplications,
          expiringLeases: expiringLeasesCount,
          maintenanceRequests: {
            total: maintenanceStats.total,
            open: maintenanceStats.open,
            inProgress: maintenanceStats.inProgress,
            completed: maintenanceStats.completed,
            urgent: maintenanceStats.urgent,
          },
          payments: {
            collected: paymentSummary.collected,
            collectedCount: paymentSummary.collectedCount,
            pending: paymentSummary.pending,
            pendingCount: paymentSummary.pendingCount,
            overdue: paymentSummary.overdue,
            overdueCount: paymentSummary.overdueCount,
            totalDue: paymentSummary.totalDue,
          },
        },
        alerts,
        trends: {
          revenue: trendData,
        },
        propertyTypes,
        recentActivities: activities,
        upcomingTasks: trimmedTasks,
      };

      return createSuccessResponse(
        response,
        "Dashboard overview metrics retrieved successfully"
      );
    } catch (error) {
      return handleApiError(error, "Failed to load dashboard overview");
    }
  }
);
