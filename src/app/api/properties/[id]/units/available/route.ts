/**
 * PropertyPro - Available Units API Route
 * Get available units for a specific property
 */

import { NextRequest } from "next/server";
import { Property } from "@/models";
import { UserRole } from "@/types";
import { requirePermission } from "@/lib/auth/require-permission";
import { isPropertyInScope } from "@/lib/auth/property-scope";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  isValidObjectId,
} from "@/lib/api-utils";

// ============================================================================
// GET /api/properties/[id]/units/available - Get available units for property
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      // Custom roles must hold this permission; built-in roles are
      // governed by the role list above.
      const denied = requirePermission(user, "property_view");
      if (denied) return denied;

      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid property ID", 400);
      }

      // Find the property
      const property = await Property.findById(id);
      if (!property) {
        return createErrorResponse("Property not found", 404);
      }

      // Units inherit the property's scope. Tenants are allowed through by the
      // route guard for their own lease flows and are not property-scoped.
      if (
        user.role !== UserRole.TENANT &&
        !isPropertyInScope(user, property)
      ) {
        return createErrorResponse("Property not found", 404);
      }

      // Filter available units - handle both lowercase and uppercase status values
      const availableUnits = property.units.filter(
        (unit: any) => unit.status?.toLowerCase() === "available"
      );

      return createSuccessResponse(
        availableUnits,
        "Available units retrieved successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
