/**
 * PropertyPro - Individual System Setting API Routes
 * CRUD operations for individual system settings by category and key
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
} from "@/lib/api-utils";

interface RouteParams {
  params: {
    category: string;
    key: string;
  };
}

const MANAGER_ALLOWED_CATEGORIES = new Set([
  "company",
  "branding",
  "display",
  "notifications",
]);

type AuthFailure = { errorResponse: Response };

type AuthSuccess = {
  userId: string;
  isAdmin: boolean;
  isManager: boolean;
};

type AuthResult = AuthFailure | AuthSuccess;

async function resolveAuthContext(): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { errorResponse: createErrorResponse("Unauthorized", 401) };
  }

  return {
    userId: session.user.id,
    isAdmin: session.user.role === UserRole.ADMIN,
    isManager: session.user.role === UserRole.MANAGER,
  };
}

function managerHasCategoryAccess(settingCategory: string, isPublic: boolean) {
  return isPublic || MANAGER_ALLOWED_CATEGORIES.has(settingCategory);
}

// ============================================================================
// GET /api/settings/system/[category]/[key] - Get specific system setting
// ============================================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const authContext = await resolveAuthContext();

    if ("errorResponse" in authContext) {
      return authContext.errorResponse;
    }

    const { isAdmin, isManager } = authContext;
    const { category, key } = params;

    // Find the setting
    const setting = await SystemSettings.getSetting(category, key);

    if (!setting) {
      return createErrorResponse("Setting not found", 404);
    }

    // Check access permissions
    if (!isAdmin && !isManager && !setting.isPublic) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    // Managers can only access company-related settings
    if (isManager && !isAdmin) {
      if (!managerHasCategoryAccess(setting.category, setting.isPublic)) {
        return createErrorResponse("Insufficient permissions", 403);
      }
    }

    await setting.populate("lastModifiedByUser");

    return createSuccessResponse({
      setting,
      message: "System setting retrieved successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PUT /api/settings/system/[category]/[key] - Update specific system setting
// ============================================================================
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const authContext = await resolveAuthContext();

    if ("errorResponse" in authContext) {
      return authContext.errorResponse;
    }

    const { isAdmin, isManager, userId } = authContext;

    // Only super admins and managers can update system settings
    if (!isAdmin && !isManager) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { category, key } = params;
    const body = await parseRequestBody(request);
    const { value } = body;

    if (value === undefined) {
      return createErrorResponse("Value is required", 400);
    }

    // Find the setting
    const setting = await SystemSettings.getSetting(category, key);

    if (!setting) {
      return createErrorResponse("Setting not found", 404);
    }

    // Managers can only update company-related settings
    if (isManager && !isAdmin) {
      if (!MANAGER_ALLOWED_CATEGORIES.has(setting.category)) {
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
    const updatedSetting = await setting.updateValue(value, userId);
    await updatedSetting.populate("lastModifiedByUser");

    return createSuccessResponse({
      setting: updatedSetting,
      message: "System setting updated successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// DELETE /api/settings/system/[category]/[key] - Delete specific system setting
// ============================================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const authContext = await resolveAuthContext();

    if ("errorResponse" in authContext) {
      return authContext.errorResponse;
    }

    const { isAdmin, isManager } = authContext;

    // Only super admins and managers can delete system settings
    if (!isAdmin && !isManager) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { category, key } = params;

    // Find the setting
    const setting = await SystemSettings.getSetting(category, key);

    if (!setting) {
      return createErrorResponse("Setting not found", 404);
    }

    // Managers can only delete company-related settings
    if (isManager && !isAdmin) {
      if (!MANAGER_ALLOWED_CATEGORIES.has(setting.category)) {
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
    return handleApiError(error);
  }
}
