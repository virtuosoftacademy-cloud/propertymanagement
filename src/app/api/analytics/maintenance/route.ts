import connectDB from "@/lib/mongodb";
import Property from "@/models/Property";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import MaintenanceRequest from "@/models/MaintenanceRequest";
import { UserRole, MaintenanceStatus, MaintenancePriority } from "@/types";

interface MaintenanceAnalyticsData {
  overview: {
    totalRequests: number;
    pendingRequests: number;
    inProgressRequests: number;
    completedRequests: number;
    totalCost: number;
    avgCompletionTime: number;
    completionRate: number;
  };
  categoryBreakdown: Array<{
    category: string;
    count: number;
    totalCost: number;
    avgCost: number;
  }>;
  statusDistribution: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  priorityDistribution: Array<{
    priority: string;
    count: number;
    percentage: number;
  }>;
  propertyBreakdown: Array<{
    propertyName: string;
    totalRequests: number;
    completedRequests: number;
    totalCost: number;
    avgResponseTime: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = session.user.role as UserRole;

    // Only allow ADMIN and MANAGER roles to access analytics
    if (![UserRole.ADMIN, UserRole.MANAGER, UserRole.ADMIN].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const property = searchParams.get("property") || "all";

    // Connect to database
    await connectDB();

    // Build filter for maintenance requests
    let maintenanceFilter: any = { deletedAt: null };
    if (property !== "all") {
      maintenanceFilter.propertyId = property;
    }

    // Fetch maintenance requests
    const maintenanceRequests = await MaintenanceRequest.find(maintenanceFilter)
      .populate("propertyId", "name")
      .lean();

    // Fetch properties for dropdown
    const properties = await Property.find({ deletedAt: null })
      .select("name")
      .lean();

    // Calculate overview statistics
    const totalRequests = maintenanceRequests.length;
    const pendingRequests = maintenanceRequests.filter(
      req => req.status === MaintenanceStatus.SUBMITTED
    ).length;
    const inProgressRequests = maintenanceRequests.filter(
      req => [MaintenanceStatus.ASSIGNED, MaintenanceStatus.IN_PROGRESS].includes(req.status)
    ).length;
    const completedRequests = maintenanceRequests.filter(
      req => req.status === MaintenanceStatus.COMPLETED
    ).length;

    // Calculate total cost (actual cost if available, otherwise estimated cost)
    const totalCost = maintenanceRequests.reduce((sum, req) => {
      const cost = req.actualCost || req.estimatedCost || 0;
      return sum + cost;
    }, 0);

    // Calculate average completion time for completed requests
    const completedWithDates = maintenanceRequests.filter(
      req => req.status === MaintenanceStatus.COMPLETED && req.completedDate && req.createdAt
    );

    const avgCompletionTime = completedWithDates.length > 0
      ? completedWithDates.reduce((sum, req) => {
          const diffTime = new Date(req.completedDate).getTime() - new Date(req.createdAt).getTime();
          const diffHours = diffTime / (1000 * 60 * 60);
          return sum + diffHours;
        }, 0) / completedWithDates.length
      : 0;

    // Calculate completion rate
    const completionRate = totalRequests > 0
      ? Math.round((completedRequests / totalRequests) * 100 * 10) / 10
      : 0;

    // Category breakdown
    const categoryMap = new Map();
    maintenanceRequests.forEach(req => {
      const category = req.category || "Other";
      const cost = req.actualCost || req.estimatedCost || 0;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { count: 0, totalCost: 0 });
      }

      const current = categoryMap.get(category);
      current.count += 1;
      current.totalCost += cost;
    });

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      totalCost: data.totalCost,
      avgCost: data.count > 0 ? Math.round(data.totalCost / data.count) : 0,
    }));

    // Status distribution
    const statusMap = new Map();
    maintenanceRequests.forEach(req => {
      const status = req.status;
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });

    const statusDistribution = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 100 * 10) / 10 : 0,
    }));

    // Priority distribution
    const priorityMap = new Map();
    maintenanceRequests.forEach(req => {
      const priority = req.priority;
      priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1);
    });

    const priorityDistribution = Array.from(priorityMap.entries()).map(([priority, count]) => ({
      priority,
      count,
      percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 100 * 10) / 10 : 0,
    }));

    // Property breakdown
    const propertyMap = new Map();
    maintenanceRequests.forEach(req => {
      const propertyName = (typeof req.propertyId === "object" && "name" in req.propertyId)
        ? (req.propertyId as { name: string }).name
        : "Unknown Property";
      const cost = req.actualCost || req.estimatedCost || 0;
      const isCompleted = req.status === MaintenanceStatus.COMPLETED;

      if (!propertyMap.has(propertyName)) {
        propertyMap.set(propertyName, {
          totalRequests: 0,
          completedRequests: 0,
          totalCost: 0,
          responseTimes: [],
        });
      }

      const current = propertyMap.get(propertyName);
      current.totalRequests += 1;
      current.totalCost += cost;

      if (isCompleted) {
        current.completedRequests += 1;

        // Calculate response time if we have the necessary dates
        if (req.completedDate && req.createdAt) {
          const diffTime = new Date(req.completedDate).getTime() - new Date(req.createdAt).getTime();
          const diffHours = diffTime / (1000 * 60 * 60);
          current.responseTimes.push(diffHours);
        }
      }
    });

    const propertyBreakdown = Array.from(propertyMap.entries()).map(([propertyName, data]) => ({
      propertyName,
      totalRequests: data.totalRequests,
      completedRequests: data.completedRequests,
      totalCost: data.totalCost,
      avgResponseTime: data.responseTimes.length > 0
        ? data.responseTimes.reduce((sum, time) => sum + time, 0) / data.responseTimes.length
        : 0,
    }));

    const analyticsData: MaintenanceAnalyticsData = {
      overview: {
        totalRequests,
        pendingRequests,
        inProgressRequests,
        completedRequests,
        totalCost,
        avgCompletionTime,
        completionRate,
      },
      categoryBreakdown,
      statusDistribution,
      priorityDistribution,
      propertyBreakdown,
    };

    return NextResponse.json({
      success: true,
      analytics: analyticsData,
      properties: properties.map(p => ({ id: p._id, name: p.name })),
      filters: {
        property,
      },
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Future: Add POST method for creating maintenance requests
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = session.user.role as UserRole;

    // Only allow ADMIN and SUPER_ADMIN to modify analytics data
    if (![UserRole.ADMIN, UserRole.ADMIN].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // This would handle creating maintenance requests in the future
    return NextResponse.json({
      success: true,
      message: "Maintenance request creation endpoint - coming soon",
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
