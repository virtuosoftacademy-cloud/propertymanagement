import { NextRequest } from "next/server";
import {
  createSuccessResponse as createApiSuccessResponse,
  createErrorResponse as createApiErrorResponse,
} from "@/lib/api-utils";
import { auth } from "@/lib/auth";
import { UserRole, PropertyStatus } from "@/types";
import Property from "@/models/Property";
import connectDB from "@/lib/mongodb";

interface OccupancyData {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  maintenanceUnits: number;
  unavailableUnits: number;
  occupancyRate: number;
  propertyBreakdown: Array<{
    propertyName: string;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    maintenanceUnits: number;
    unavailableUnits: number;
    occupancyRate: number;
  }>;
}

interface OccupancyAnalyticsPayload {
  analytics: OccupancyData;
  filters: {
    property: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse("Unauthorized", 401, "Unauthorized");
    }

    const userRole = session.user.role as UserRole;

    // Only allow ADMIN and MANAGER roles to access analytics
    if (
      ![UserRole.ADMIN, UserRole.MANAGER, UserRole.ADMIN].includes(userRole)
    ) {
      return createApiErrorResponse("Forbidden", 403, "Forbidden");
    }

    const { searchParams } = new URL(request.url);
    const property = searchParams.get("property") || "all";

    // Connect to database
    await connectDB();

    // Build property filter
    let propertyFilter: any = { deletedAt: null };
    if (property !== "all") {
      propertyFilter._id = property;
    }

    // Fetch all properties
    const properties = await Property.find(propertyFilter)
      .select("name units totalUnits status")
      .lean();

    // Calculate overall statistics
    let totalUnits = 0;
    let occupiedUnits = 0;
    let vacantUnits = 0;
    let maintenanceUnits = 0;
    let unavailableUnits = 0;

    // Property breakdown data
    const propertyBreakdown = properties.map((property) => {
      const units = property.units || [];
      const propertyTotalUnits = units.length || property.totalUnits || 1;

      // Count units by status
      const propertyOccupied = units.filter(
        (unit: any) => unit.status === PropertyStatus.OCCUPIED
      ).length;

      const propertyVacant = units.filter(
        (unit: any) => unit.status === PropertyStatus.AVAILABLE
      ).length;

      const propertyMaintenance = units.filter(
        (unit: any) => unit.status === PropertyStatus.MAINTENANCE
      ).length;

      const propertyUnavailable = units.filter(
        (unit: any) => unit.status === PropertyStatus.UNAVAILABLE
      ).length;

      // If no units array, use property status
      let finalOccupied = propertyOccupied;
      let finalVacant = propertyVacant;
      let finalMaintenance = propertyMaintenance;
      let finalUnavailable = propertyUnavailable;

      if (units.length === 0) {
        // Single unit property - use property status
        switch (property.status) {
          case PropertyStatus.OCCUPIED:
            finalOccupied = 1;
            break;
          case PropertyStatus.AVAILABLE:
            finalVacant = 1;
            break;
          case PropertyStatus.MAINTENANCE:
            finalMaintenance = 1;
            break;
          case PropertyStatus.UNAVAILABLE:
            finalUnavailable = 1;
            break;
        }
      }

      // Add to totals
      totalUnits += propertyTotalUnits;
      occupiedUnits += finalOccupied;
      vacantUnits += finalVacant;
      maintenanceUnits += finalMaintenance;
      unavailableUnits += finalUnavailable;

      // Calculate occupancy rate for this property
      const propertyOccupancyRate =
        propertyTotalUnits > 0
          ? Math.round((finalOccupied / propertyTotalUnits) * 100 * 10) / 10
          : 0;

      return {
        propertyName: property.name,
        totalUnits: propertyTotalUnits,
        occupiedUnits: finalOccupied,
        vacantUnits: finalVacant,
        maintenanceUnits: finalMaintenance,
        unavailableUnits: finalUnavailable,
        occupancyRate: propertyOccupancyRate,
      };
    });

    // Calculate overall occupancy rate
    const occupancyRate =
      totalUnits > 0
        ? Math.round((occupiedUnits / totalUnits) * 100 * 10) / 10
        : 0;

    const occupancyData: OccupancyData = {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      maintenanceUnits,
      unavailableUnits,
      occupancyRate,
      propertyBreakdown,
    };

    return createApiSuccessResponse<OccupancyAnalyticsPayload>(
      {
        analytics: occupancyData,
        filters: {
          property,
        },
      },
      "Occupancy analytics retrieved successfully"
    );
  } catch (error) {
    return createApiErrorResponse(
      "Internal server error",
      500,
      "Internal server error"
    );
  }
}

// Future: Add POST method for updating occupancy data
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse("Unauthorized", 401, "Unauthorized");
    }

    const userRole = session.user.role as UserRole;

    // Only allow ADMIN and SUPER_ADMIN to modify analytics data
    if (![UserRole.ADMIN, UserRole.ADMIN].includes(userRole)) {
      return createApiErrorResponse("Forbidden", 403, "Forbidden");
    }

    // This would handle updating occupancy data in the future
    return createApiSuccessResponse<{ message: string }>(
      { message: "Occupancy data update endpoint - coming soon" },
      "Occupancy data update endpoint - coming soon"
    );
  } catch (error) {
    return createApiErrorResponse(
      "Internal server error",
      500,
      "Internal server error"
    );
  }
}
