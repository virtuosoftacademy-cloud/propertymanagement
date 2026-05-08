/**
 * PropertyPro - System Settings API Routes
 * CRUD operations for system-wide configuration settings
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { SystemSettings } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  parsePaginationParams,
  paginateQuery,
} from "@/lib/api-utils";
import {
  systemSettingSchema,
  systemSettingsQuerySchema,
  validateSchema,
} from "@/lib/validations";

// ============================================================================
// GET /api/settings/system - Get system settings
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const userRole = session.user.role as UserRole;
    const isAdmin = userRole === UserRole.ADMIN;
    const isManager = userRole === UserRole.MANAGER;
    const hasSystemAccess = isAdmin || isManager;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryData = Object.fromEntries(searchParams.entries());

    const validation = validateSchema(systemSettingsQuerySchema, queryData);
    if (!validation.success) {
      return createErrorResponse(
        `Invalid query parameters: ${validation.errors.join(", ")}`,
        400
      );
    }

    const { category, isPublic, isEditable } = validation.data;
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(
      request.nextUrl.searchParams
    );

    // Build query based on user role and filters
    let query: any = {};

    // Non-admins and non-managers can only see public settings
    // Managers can see company-related settings, admins can see all
    if (!hasSystemAccess) {
      query.isPublic = true;
    } else if (isManager && !isAdmin) {
      // Managers can see public settings and company-related settings
      query.$or = [
        { isPublic: true },
        {
          category: {
            $in: ["company", "branding", "display", "notifications"],
          },
        },
      ];
    } else if (isPublic !== undefined) {
      query.isPublic = isPublic;
    }

    if (category) {
      query.category = category;
    }

    if (isEditable !== undefined) {
      query.isEditable = isEditable;
    }

    // Execute paginated query
    const result = await paginateQuery(SystemSettings, query, {
      page,
      limit,
      sortBy: sortBy || "category",
      sortOrder,
    });

    // Populate the lastModifiedByUser field for each setting
    const populatedSettings = await SystemSettings.populate(result.data, {
      path: "lastModifiedByUser",
      select: "name email",
    });

    return createSuccessResponse({
      settings: populatedSettings,
      pagination: result.pagination,
      message: "System settings retrieved successfully",
    });
  } catch (error) {
    console.error("Get system settings error:", error);
    return handleApiError(error);
  }
}

// ============================================================================
// POST /api/settings/system - Create new system setting
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const userRole = session.user.role as UserRole;
    const isAdmin = userRole === UserRole.ADMIN;
    const isManager = userRole === UserRole.MANAGER;

    // Only super admins can create system settings
    // Managers can create company-related settings
    if (!isAdmin && !isManager) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const body = await parseRequestBody(request);

    // Validate the request body
    const validation = validateSchema(systemSettingSchema, body);
    if (!validation.success) {
      return createErrorResponse(
        `Validation failed: ${validation.errors.join(", ")}`,
        400
      );
    }

    const settingData = {
      ...validation.data,
      lastModifiedBy: session.user.id,
    };

    // Managers can only create company-related settings
    if (isManager && !isAdmin) {
      const allowedCategories = [
        "company",
        "branding",
        "display",
        "notifications",
      ];
      if (!allowedCategories.includes(settingData.category)) {
        return createErrorResponse(
          "Managers can only create company-related settings",
          403
        );
      }
    }

    // Check if setting already exists
    const existingSetting = await SystemSettings.getSetting(
      settingData.category,
      settingData.key
    );

    if (existingSetting) {
      return createErrorResponse(
        "Setting with this category and key already exists",
        409
      );
    }

    // Create new setting
    const newSetting = new SystemSettings(settingData);
    await newSetting.save();

    // Populate the lastModifiedByUser field
    await newSetting.populate("lastModifiedByUser");

    return createSuccessResponse(
      {
        setting: newSetting,
        message: "System setting created successfully",
      },
      201
    );
  } catch (error) {
    console.error("Create system setting error:", error);
    return handleApiError(error);
  }
}

// ============================================================================
// PUT /api/settings/system - Update system setting
// ============================================================================
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const userRole = session.user.role as UserRole;
    const isAdmin = userRole === UserRole.ADMIN;
    const isManager = userRole === UserRole.MANAGER;

    // Only super admins and managers can update system settings
    if (!isAdmin && !isManager) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const body = await parseRequestBody(request);
    const { category, key, value } = body;

    if (!category || !key || value === undefined) {
      return createErrorResponse("Category, key, and value are required", 400);
    }

    // Find the setting
    const setting = await SystemSettings.getSetting(category, key);

    if (!setting) {
      return createErrorResponse("Setting not found", 404);
    }

    // Managers can only update company-related settings
    if (isManager && !isAdmin) {
      const allowedCategories = [
        "company",
        "branding",
        "display",
        "notifications",
      ];
      if (!allowedCategories.includes(setting.category)) {
        return createErrorResponse(
          "Managers can only update company-related settings",
          403
        );
      }
    }

    // Check if setting is editable
    if (!setting.isEditable) {
      return createErrorResponse("This setting is not editable", 403);
    }

    // Validate the new value
    if (!setting.isValidValue(value)) {
      return createErrorResponse("Invalid value for this setting", 400);
    }

    // Update the setting
    const updatedSetting = await setting.updateValue(value, session.user.id);
    await updatedSetting.populate("lastModifiedByUser");

    return createSuccessResponse({
      setting: updatedSetting,
      message: "System setting updated successfully",
    });
  } catch (error) {
    console.error("Update system setting error:", error);
    return handleApiError(error);
  }
}

// ============================================================================
// DELETE /api/settings/system - Delete system setting
// ============================================================================
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const userRole = session.user.role as UserRole;
    const isAdmin = userRole === UserRole.ADMIN;
    const isManager = userRole === UserRole.MANAGER;

    // Only super admins and managers can delete system settings
    if (!isAdmin && !isManager) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const key = searchParams.get("key");

    if (!category || !key) {
      return createErrorResponse("Category and key are required", 400);
    }

    // Find the setting
    const setting = await SystemSettings.getSetting(category, key);

    if (!setting) {
      return createErrorResponse("Setting not found", 404);
    }

    // Managers can only delete company-related settings
    if (isManager && !isAdmin) {
      const allowedCategories = [
        "company",
        "branding",
        "display",
        "notifications",
      ];
      if (!allowedCategories.includes(setting.category)) {
        return createErrorResponse(
          "Managers can only delete company-related settings",
          403
        );
      }
    }

    // Check if setting is editable (deletable)
    if (!setting.isEditable) {
      return createErrorResponse("This setting cannot be deleted", 403);
    }

    // Delete the setting
    await SystemSettings.findByIdAndDelete(setting._id);

    return createSuccessResponse({
      message: "System setting deleted successfully",
    });
  } catch (error) {
    console.error("Delete system setting error:", error);
    return handleApiError(error);
  }
}
