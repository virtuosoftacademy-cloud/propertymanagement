/**
 * PropertyPro - Analytics API Routes
 * Generate comprehensive analytics and business intelligence data
 */

import { NextRequest } from "next/server";
import { Property, Tenant, Lease, Payment, MaintenanceRequest } from "@/models";
import { applyPropertyScope } from "@/lib/auth/property-scope";
import {
  UserRole,
  PaymentStatus,
  LeaseStatus,
  MaintenanceStatus,
} from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { requirePermission } from "@/lib/auth/require-permission";

// ============================================================================
// GET /api/analytics - Get comprehensive analytics data
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
])(async (user, request: NextRequest) => {
  // Reporting is a paid capability; plan roles that lack reports_property must
  // not reach it. Built-in roles pass through untouched.
  const denied = requirePermission(user, "reports_property");
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("type") || "overview";
    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();
    const propertyId = searchParams.get("propertyId");

    // Build base query for user role.
    //
    // This single object feeds every generator below — each does
    // `Property.find(propertyQuery)` and derives propertyIds for its
    // aggregations — so scoping here scopes the whole analytics tree.
    let basePropertyQuery: any = {};
    if (propertyId) {
      basePropertyQuery._id = propertyId;
    }
    // Restrict to the caller's properties. Applied AFTER the propertyId filter
    // so a hand-crafted ?propertyId= outside the caller's scope yields no
    // matching property rather than data.
    applyPropertyScope(basePropertyQuery, user);

    switch (reportType) {
      case "overview":
        return await generateOverviewAnalytics(
          basePropertyQuery,
          startDate,
          endDate
        );
      case "financial":
        return await generateFinancialAnalytics(
          basePropertyQuery,
          startDate,
          endDate
        );
      case "occupancy":
        return await generateOccupancyAnalytics(
          basePropertyQuery,
          startDate,
          endDate
        );
      case "maintenance":
        return await generateMaintenanceAnalytics(
          basePropertyQuery,
          startDate,
          endDate
        );
      case "performance":
        return await generatePerformanceAnalytics(
          basePropertyQuery,
          startDate,
          endDate
        );
      default:
        return createErrorResponse("Invalid analytics type", 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
});

// ============================================================================
// ANALYTICS GENERATORS
// ============================================================================

async function generateOverviewAnalytics(
  propertyQuery: any,
  startDate: Date,
  endDate: Date
) {
  try {
    // Get properties in scope
    const properties = await Property.find(propertyQuery);
    const propertyIds = properties.map((p) => p._id);

    // Portfolio Overview
    const portfolioStats = {
      totalProperties: properties.length,
      // `p.units` is the embedded units ARRAY, not a count. Adding it to a
      // number made JS stringify: the total came out as
      // "0[object Object],[object Object]…", so `totalUnits > 0` was false and
      // occupancyRate/vacant both resolved to NaN. Mirrors Property.pre("save")
      // (totalUnits = units.length || 1), so a property with no embedded units
      // still counts as one.
      totalUnits: properties.reduce(
        (sum: number, p: any) => sum + (p.units?.length || 1),
        0
      ),
      totalValue: properties.reduce((sum, p) => sum + (p.value || 0), 0),
      averageRent:
        properties.reduce((sum, p) => sum + (p.rentAmount || 0), 0) /
          properties.length || 0,
    };

    // Occupancy Overview
    const totalLeases = await Lease.countDocuments({
      propertyId: { $in: propertyIds },
      status: LeaseStatus.ACTIVE,
    });
    const occupancyRate =
      portfolioStats.totalUnits > 0
        ? (totalLeases / portfolioStats.totalUnits) * 100
        : 0;

    // Financial Overview
    const financialStats = await Payment.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          dueDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", PaymentStatus.COMPLETED] },
                "$amount",
                0,
              ],
            },
          },
          pendingRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", PaymentStatus.PENDING] },
                "$amount",
                0,
              ],
            },
          },
          totalPayments: { $sum: 1 },
          completedPayments: {
            $sum: {
              $cond: [{ $eq: ["$status", PaymentStatus.COMPLETED] }, 1, 0],
            },
          },
        },
      },
    ]);

    const financial = financialStats[0] || {
      totalRevenue: 0,
      pendingRevenue: 0,
      totalPayments: 0,
      completedPayments: 0,
    };

    // Maintenance Overview
    const maintenanceStats = await MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalCost: { $sum: { $ifNull: ["$actualCost", "$estimatedCost"] } },
        },
      },
    ]);

    // Recent Activity
    const recentActivity = await getRecentActivity(propertyIds, 10);

    // Monthly Trends
    const monthlyTrends = await getMonthlyTrends(
      propertyIds,
      startDate,
      endDate
    );

    return createSuccessResponse(
      {
        portfolio: portfolioStats,
        occupancy: {
          rate: Math.round(occupancyRate * 100) / 100,
          occupied: totalLeases,
          total: portfolioStats.totalUnits,
          vacant: portfolioStats.totalUnits - totalLeases,
        },
        financial: {
          ...financial,
          collectionRate:
            financial.totalPayments > 0
              ? (financial.completedPayments / financial.totalPayments) * 100
              : 0,
        },
        maintenance: maintenanceStats.reduce((acc, stat) => {
          acc[stat._id] = { count: stat.count, cost: stat.totalCost };
          return acc;
        }, {} as any),
        recentActivity,
        monthlyTrends,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      "Overview analytics generated successfully"
    );
  } catch (error) {
    throw error;
  }
}

async function generateFinancialAnalytics(
  propertyQuery: any,
  startDate: Date,
  endDate: Date
) {
  try {
    const properties = await Property.find(propertyQuery);
    const propertyIds = properties.map((p) => p._id);

    // Revenue Analysis
    const revenueAnalysis = await Payment.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          dueDate: { $gte: startDate, $lte: endDate },
          status: PaymentStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$paidDate" },
            month: { $month: "$paidDate" },
            type: "$type",
          },
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Property Performance
    const propertyPerformance = await Payment.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          dueDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $lookup: {
          from: "properties",
          localField: "propertyId",
          foreignField: "_id",
          as: "property",
        },
      },
      { $unwind: "$property" },
      {
        $group: {
          _id: "$propertyId",
          propertyName: { $first: "$property.name" },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", PaymentStatus.COMPLETED] },
                "$amount",
                0,
              ],
            },
          },
          pendingRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", PaymentStatus.PENDING] },
                "$amount",
                0,
              ],
            },
          },
          paymentCount: { $sum: 1 },
          collectionRate: {
            $avg: {
              $cond: [{ $eq: ["$status", PaymentStatus.COMPLETED] }, 1, 0],
            },
          },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    // Cash Flow Analysis
    const cashFlow = await getCashFlowAnalysis(propertyIds, startDate, endDate);

    return createSuccessResponse(
      {
        revenueAnalysis,
        propertyPerformance,
        cashFlow,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      "Financial analytics generated successfully"
    );
  } catch (error) {
    throw error;
  }
}

async function generateOccupancyAnalytics(
  propertyQuery: any,
  startDate: Date,
  endDate: Date
) {
  try {
    const properties = await Property.find(propertyQuery);
    const propertyIds = properties.map((p) => p._id);

    // Occupancy Trends
    const occupancyTrends = await Lease.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          $or: [
            { startDate: { $gte: startDate, $lte: endDate } },
            { endDate: { $gte: startDate, $lte: endDate } },
            { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
          ],
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$startDate" },
            month: { $month: "$startDate" },
          },
          newLeases: { $sum: 1 },
          avgRent: { $avg: "$terms.rentAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Lease Expiration Analysis
    const leaseExpirations = await Lease.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          status: LeaseStatus.ACTIVE,
          endDate: {
            $gte: new Date(),
            $lte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$endDate" },
            month: { $month: "$endDate" },
          },
          expiringLeases: { $sum: 1 },
          potentialRevenue: { $sum: "$terms.rentAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Vacancy Analysis
    const vacancyAnalysis = await getVacancyAnalysis(propertyIds);

    return createSuccessResponse(
      {
        occupancyTrends,
        leaseExpirations,
        vacancyAnalysis,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      "Occupancy analytics generated successfully"
    );
  } catch (error) {
    throw error;
  }
}

async function generateMaintenanceAnalytics(
  propertyQuery: any,
  startDate: Date,
  endDate: Date
) {
  try {
    const properties = await Property.find(propertyQuery);
    const propertyIds = properties.map((p) => p._id);

    // Overview Statistics
    const overviewStats = await MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          createdAt: { $gte: startDate, $lte: endDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          pendingRequests: {
            $sum: {
              $cond: [{ $eq: ["$status", MaintenanceStatus.SUBMITTED] }, 1, 0],
            },
          },
          inProgressRequests: {
            $sum: {
              $cond: [
                { $eq: ["$status", MaintenanceStatus.IN_PROGRESS] },
                1,
                0,
              ],
            },
          },
          completedRequests: {
            $sum: {
              $cond: [{ $eq: ["$status", MaintenanceStatus.COMPLETED] }, 1, 0],
            },
          },
          totalCost: { $sum: { $ifNull: ["$actualCost", "$estimatedCost"] } },
          avgCompletionTime: {
            $avg: {
              $cond: [
                { $ne: ["$completedDate", null] },
                {
                  $divide: [
                    { $subtract: ["$completedDate", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                null,
              ],
            },
          },
        },
      },
    ]);

    const overview = overviewStats[0] || {
      totalRequests: 0,
      pendingRequests: 0,
      inProgressRequests: 0,
      completedRequests: 0,
      totalCost: 0,
      avgCompletionTime: 0,
    };

    overview.avgCost =
      overview.totalRequests > 0
        ? overview.totalCost / overview.totalRequests
        : 0;
    overview.completionRate =
      overview.totalRequests > 0
        ? (overview.completedRequests / overview.totalRequests) * 100
        : 0;

    // Monthly Trends
    const monthlyTrends = await MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          createdAt: { $gte: startDate, $lte: endDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          requests: { $sum: 1 },
          cost: { $sum: { $ifNull: ["$actualCost", "$estimatedCost"] } },
          avgTime: {
            $avg: {
              $cond: [
                { $ne: ["$completedDate", null] },
                {
                  $divide: [
                    { $subtract: ["$completedDate", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                null,
              ],
            },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Category Breakdown
    const categoryBreakdown = await MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          createdAt: { $gte: startDate, $lte: endDate },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          cost: { $sum: { $ifNull: ["$actualCost", "$estimatedCost"] } },
          avgTime: {
            $avg: {
              $cond: [
                { $ne: ["$completedDate", null] },
                {
                  $divide: [
                    { $subtract: ["$completedDate", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                null,
              ],
            },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Property Performance
    const propertyPerformance = await MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          createdAt: { $gte: startDate, $lte: endDate },
          deletedAt: null,
        },
      },
      {
        $lookup: {
          from: "properties",
          localField: "propertyId",
          foreignField: "_id",
          as: "property",
        },
      },
      { $unwind: "$property" },
      {
        $group: {
          _id: "$propertyId",
          propertyName: { $first: "$property.name" },
          totalRequests: { $sum: 1 },
          completedRequests: {
            $sum: {
              $cond: [{ $eq: ["$status", MaintenanceStatus.COMPLETED] }, 1, 0],
            },
          },
          totalCost: { $sum: { $ifNull: ["$actualCost", "$estimatedCost"] } },
          avgResponseTime: {
            $avg: {
              $cond: [
                { $ne: ["$completedDate", null] },
                {
                  $divide: [
                    { $subtract: ["$completedDate", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                null,
              ],
            },
          },
        },
      },
      { $sort: { totalRequests: -1 } },
    ]);

    // Technician Performance (if assignedTo exists)
    const technicianPerformance = await MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          createdAt: { $gte: startDate, $lte: endDate },
          deletedAt: null,
          assignedTo: { $exists: true, $ne: null },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "technician",
        },
      },
      { $unwind: "$technician" },
      {
        $group: {
          _id: "$assignedTo",
          technicianName: {
            $first: {
              $concat: ["$technician.firstName", " ", "$technician.lastName"],
            },
          },
          assignedRequests: { $sum: 1 },
          completedRequests: {
            $sum: {
              $cond: [{ $eq: ["$status", MaintenanceStatus.COMPLETED] }, 1, 0],
            },
          },
          avgCompletionTime: {
            $avg: {
              $cond: [
                { $ne: ["$completedDate", null] },
                {
                  $divide: [
                    { $subtract: ["$completedDate", "$createdAt"] },
                    1000 * 60 * 60,
                  ],
                },
                null,
              ],
            },
          },
          rating: { $avg: { $ifNull: ["$rating", 4.5] } },
        },
      },
      { $sort: { assignedRequests: -1 } },
    ]);

    return createSuccessResponse(
      {
        overview,
        trends: {
          monthly: monthlyTrends.map((item) => ({
            month: new Date(
              item._id.year,
              item._id.month - 1
            ).toLocaleDateString("en-US", { month: "short" }),
            requests: item.requests,
            cost: item.cost,
            avgTime: item.avgTime || 0,
          })),
          categories: categoryBreakdown.map((item) => ({
            category: item._id || "Other",
            count: item.count,
            cost: item.cost,
            avgTime: item.avgTime || 0,
          })),
        },
        performance: {
          byProperty: propertyPerformance,
          byTechnician: technicianPerformance,
        },
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      "Maintenance analytics generated successfully"
    );
  } catch (error) {
    throw error;
  }
}

async function generatePerformanceAnalytics(
  propertyQuery: any,
  startDate: Date,
  endDate: Date
) {
  try {
    const properties = await Property.find(propertyQuery);
    const propertyIds = properties.map((p) => p._id);

    // ROI Analysis
    const netMargin = await calculateNetMargin(
      propertyIds,
      startDate,
      endDate
    );

    // Tenant Satisfaction Metrics
    const tenantMetrics = await getTenantSatisfactionMetrics(
      propertyIds,
      startDate,
      endDate
    );

    // Market Comparison
    const marketComparison = await getMarketComparison(properties);

    return createSuccessResponse(
      {
        netMargin,
        tenantMetrics,
        marketComparison,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      "Performance analytics generated successfully"
    );
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getRecentActivity(propertyIds: any[], limit: number) {
  // This would aggregate recent activities from various collections
  // For now, return mock data structure
  return [
    {
      type: "lease_signed",
      description: "New lease signed for Unit 4B",
      timestamp: new Date(),
    },
    {
      type: "payment_received",
      description: "Rent payment received from John Doe",
      timestamp: new Date(),
    },
    {
      type: "maintenance_completed",
      description: "Plumbing repair completed",
      timestamp: new Date(),
    },
  ];
}

/**
 * Month-by-month revenue, occupancy and maintenance cost across the window.
 *
 * Replaces a stub that returned `{ revenue: [], occupancy: [], maintenance: [] }`,
 * which left every trend chart drawing an empty grid.
 *
 * Occupancy is derived from lease DATE RANGES, not current status: a lease that
 * has since expired still occupied its unit while it ran, so judging by today's
 * status would report historic months as empty. Only leases that never
 * commenced (draft / pending / pending_signature) are excluded, along with
 * soft-deleted ones.
 *
 * Returns an array of points rather than three parallel arrays — that is the
 * shape every chart on the analytics page consumes, and it keeps the three
 * metrics aligned to the same month.
 */
async function getMonthlyTrends(
  propertyIds: any[],
  startDate: Date,
  endDate: Date
) {
  const NEVER_OCCUPIED = [
    LeaseStatus.DRAFT,
    LeaseStatus.PENDING,
    LeaseStatus.PENDING_SIGNATURE,
  ];

  const [properties, leases, revenueByMonth, costByMonth] = await Promise.all([
    Property.find({ _id: { $in: propertyIds } })
      .select("units")
      .lean(),

    // Any lease whose term overlaps the window at all. An absent endDate means
    // open-ended, so it is still running.
    Lease.find({
      propertyId: { $in: propertyIds },
      status: { $nin: NEVER_OCCUPIED },
      startDate: { $lte: endDate },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: startDate } },
      ],
    })
      .select("propertyId unitId startDate endDate")
      .lean(),

    Payment.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          status: PaymentStatus.COMPLETED,
          $expr: {
            $and: [
              { $gte: [{ $ifNull: ["$paidDate", "$dueDate"] }, startDate] },
              { $lte: [{ $ifNull: ["$paidDate", "$dueDate"] }, endDate] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { $ifNull: ["$paidDate", "$dueDate"] } },
            month: { $month: { $ifNull: ["$paidDate", "$dueDate"] } },
          },
          total: { $sum: "$amount" },
        },
      },
    ]),

    MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          deletedAt: null,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          total: {
            $sum: {
              $ifNull: ["$actualCost", { $ifNull: ["$estimatedCost", 0] }],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Matches Property.pre("save"): a property with no embedded units is one unit.
  const totalUnits = (properties as any[]).reduce(
    (sum, p) => sum + (p.units?.length || 1),
    0
  );

  const revenueMap = new Map(
    (revenueByMonth as any[]).map((r) => [`${r._id.year}-${r._id.month}`, r.total])
  );
  const costMap = new Map(
    (costByMonth as any[]).map((r) => [
      `${r._id.year}-${r._id.month}`,
      { cost: r.total, count: r.count },
    ])
  );

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const points: any[] = [];
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
  );
  const limit = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)
  );

  while (cursor <= limit) {
    const year = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth();
    const key = `${year}-${monthIndex + 1}`;

    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    // Day 0 of the next month is the last day of this one.
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    // Distinct units held by a lease running at any point in this month.
    const occupiedUnits = new Set<string>();
    for (const lease of leases as any[]) {
      const leaseStart = new Date(lease.startDate);
      const leaseEnd = lease.endDate ? new Date(lease.endDate) : null;
      const startedBeforeMonthEnd = leaseStart <= monthEnd;
      const stillRunning = !leaseEnd || leaseEnd >= monthStart;

      if (startedBeforeMonthEnd && stillRunning) {
        // unitId when present; otherwise the property counts as its own unit.
        occupiedUnits.add(
          String(lease.unitId ?? `property:${lease.propertyId}`)
        );
      }
    }

    const expense = costMap.get(key) ?? { cost: 0, count: 0 };

    points.push({
      month: MONTHS[monthIndex],
      monthKey: key,
      revenue: revenueMap.get(key) ?? 0,
      occupancy:
        totalUnits > 0
          ? Math.round((occupiedUnits.size / totalUnits) * 100 * 10) / 10
          : 0,
      occupiedUnits: occupiedUnits.size,
      totalUnits,
      maintenance: expense.cost,
      maintenanceCount: expense.count,
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
}

async function getCashFlowAnalysis(
  propertyIds: any[],
  startDate: Date,
  endDate: Date
) {
  // Calculate cash flow metrics
  return {
    inflow: 0,
    outflow: 0,
    netCashFlow: 0,
    monthlyTrends: [],
  };
}

async function getVacancyAnalysis(propertyIds: any[]) {
  // Analyze vacancy patterns and costs
  return {
    currentVacancies: 0,
    avgVacancyDuration: 0,
    vacancyCost: 0,
    trends: [],
  };
}

/**
 * Net operating margin: what share of collected revenue survives maintenance
 * costs, as a percentage.
 *
 * This replaced a `calculateROI` stub. True ROI needs an investment
 * denominator — a purchase price or asset value — and the Property model
 * carries none (no value/price/purchase field exists on the schema or on any
 * stored document), so a genuine ROI cannot be derived from this data. Margin
 * measures operating efficiency instead, which the data does support.
 *
 * `hasRevenue` is returned separately because a margin is undefined with no
 * revenue: dividing by zero would surface as 0%, which reads as "we kept none
 * of it" rather than "there was nothing to keep".
 */
async function calculateNetMargin(
  propertyIds: any[],
  startDate: Date,
  endDate: Date
) {
  const [revenueAgg, expenseAgg] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          status: PaymentStatus.COMPLETED,
          $expr: {
            $and: [
              { $gte: [{ $ifNull: ["$paidDate", "$dueDate"] }, startDate] },
              { $lte: [{ $ifNull: ["$paidDate", "$dueDate"] }, endDate] },
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    MaintenanceRequest.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          deletedAt: null,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          // Prefer what it actually cost; fall back to the estimate.
          total: {
            $sum: {
              $ifNull: ["$actualCost", { $ifNull: ["$estimatedCost", 0] }],
            },
          },
        },
      },
    ]),
  ]);

  const revenue = revenueAgg[0]?.total ?? 0;
  const expenses = expenseAgg[0]?.total ?? 0;
  const netIncome = revenue - expenses;

  return {
    revenue,
    expenses,
    netIncome,
    // Negative is meaningful — costs exceeded what was collected.
    marginPct:
      revenue > 0 ? Math.round((netIncome / revenue) * 100 * 10) / 10 : 0,
    hasRevenue: revenue > 0,
  };
}

/** A tenant moving out and back within this window still counts as retained. */
const RETENTION_GRACE_DAYS = 60;

/**
 * Tenant retention, measured from lease history.
 *
 * Of the leases that ENDED in the window, how many of those tenants went on to
 * hold another lease? A tenant whose lease ended and who signed again — whether
 * on the same unit or a different one — was retained; one who left was not.
 *
 * - retentionRate: kept the tenant at all (any subsequent lease)
 * - renewalRate:   kept them in the SAME unit (a renewal rather than a move)
 *
 * Renewals are a subset of retentions, so renewalRate <= retentionRate always.
 *
 * Soft-deleted leases are excluded: the model's pre(/^find/) hook drops them
 * unless a query names deletedAt, and a deleted record should not count either
 * as an ending or as a retention.
 *
 * satisfactionScore stays 0 — the app has no survey, rating or feedback model,
 * so there is nothing to compute it from. Returning a number here would be
 * inventing one.
 */
async function getTenantSatisfactionMetrics(
  propertyIds: any[],
  startDate: Date,
  endDate: Date
) {
  const ENDED_STATUSES = [
    LeaseStatus.EXPIRED,
    LeaseStatus.TERMINATED,
    LeaseStatus.RENEWED,
  ];

  const endedLeases = await Lease.find({
    propertyId: { $in: propertyIds },
    status: { $in: ENDED_STATUSES },
    endDate: { $gte: startDate, $lte: endDate },
  })
    .select("_id tenantId unitId endDate")
    .lean();

  if (endedLeases.length === 0) {
    return { satisfactionScore: 0, retentionRate: 0, renewalRate: 0, endedLeases: 0 };
  }

  // One query for every candidate follow-on lease, rather than one per ended
  // lease — the comparison is then done in memory.
  const tenantIds = [...new Set(endedLeases.map((l: any) => String(l.tenantId)))];
  const laterLeases = await Lease.find({
    tenantId: { $in: tenantIds },
    startDate: { $gte: startDate },
  })
    .select("_id tenantId unitId startDate")
    .lean();

  const byTenant = new Map<string, any[]>();
  for (const lease of laterLeases as any[]) {
    const key = String(lease.tenantId);
    if (!byTenant.has(key)) byTenant.set(key, []);
    byTenant.get(key)!.push(lease);
  }

  let retained = 0;
  let renewed = 0;

  for (const ended of endedLeases as any[]) {
    const candidates = byTenant.get(String(ended.tenantId)) ?? [];
    const endedAt = new Date(ended.endDate).getTime();
    const cutoff = endedAt - RETENTION_GRACE_DAYS * 24 * 60 * 60 * 1000;

    // A follow-on lease starting at or after the old one ended (allowing an
    // overlap of up to the grace window, since a renewal is often signed
    // slightly before the previous term runs out).
    //
    // The ended lease is excluded by id: the grace window reaches back before
    // its own end date, so without this a single lease would satisfy its own
    // retention and every ending would score 100%.
    const followOn = candidates.filter(
      (c) =>
        String(c._id) !== String(ended._id) &&
        new Date(c.startDate).getTime() >= cutoff
    );

    if (followOn.length > 0) {
      retained += 1;
      if (
        ended.unitId &&
        followOn.some(
          (c) => c.unitId && String(c.unitId) === String(ended.unitId)
        )
      ) {
        renewed += 1;
      }
    }
  }

  const pct = (n: number) =>
    Math.round((n / endedLeases.length) * 100 * 10) / 10;

  return {
    satisfactionScore: 0,
    retentionRate: pct(retained),
    renewalRate: pct(renewed),
    // Surfaced so the client can tell "0% of 12" from "no leases ended".
    endedLeases: endedLeases.length,
  };
}

async function getMarketComparison(properties: any[]) {
  // Compare property performance to market averages
  return {
    rentComparison: 0,
    occupancyComparison: 0,
    marketTrends: [],
  };
}
