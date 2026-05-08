/**
 * PropertyPro - Analytics API Routes
 * Generate comprehensive analytics and business intelligence data
 */

import { NextRequest } from "next/server";
import { Property, Tenant, Lease, Payment, MaintenanceRequest } from "@/models";
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

// ============================================================================
// GET /api/analytics - Get comprehensive analytics data
// ============================================================================

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
])(async (user, request: NextRequest) => {
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

    // Build base query for user role
    // Single company architecture - Managers can view analytics for all properties
    let basePropertyQuery: any = {};
    if (propertyId) {
      basePropertyQuery._id = propertyId;
    }

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
      totalUnits: properties.reduce((sum, p) => sum + (p.units || 1), 0),
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
    const roiAnalysis = await calculateROI(propertyIds, startDate, endDate);

    // Tenant Satisfaction Metrics
    const tenantMetrics = await getTenantSatisfactionMetrics(propertyIds);

    // Market Comparison
    const marketComparison = await getMarketComparison(properties);

    return createSuccessResponse(
      {
        roiAnalysis,
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

async function getMonthlyTrends(
  propertyIds: any[],
  startDate: Date,
  endDate: Date
) {
  // This would calculate monthly trends across key metrics
  return {
    revenue: [],
    occupancy: [],
    maintenance: [],
  };
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

async function calculateROI(
  propertyIds: any[],
  startDate: Date,
  endDate: Date
) {
  // Calculate return on investment metrics
  return {
    totalROI: 0,
    monthlyROI: 0,
    propertyROI: [],
  };
}

async function getTenantSatisfactionMetrics(propertyIds: any[]) {
  // Calculate tenant satisfaction and retention metrics
  return {
    satisfactionScore: 0,
    retentionRate: 0,
    renewalRate: 0,
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
