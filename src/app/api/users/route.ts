/**
 * PropertyPro - Users API Routes
 * Handle user-related operations with role-based access control
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { User, Role } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import connectDB from "@/lib/mongodb";
import { auditService } from "@/lib/audit-service";
import { AuditCategory, AuditAction, AuditSeverity } from "@/models/AuditLog";

type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

// ============================================================================
// GET /api/users - Get all users with filtering and pagination
// ============================================================================

export const GET = async (request: NextRequest) => {
  try {
    // Connect to database
    await connectDB();

    // Check authentication and authorization
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check if user has permission to view users
    const canViewUsers = [UserRole.ADMIN, UserRole.MANAGER].includes(
      session.user.role as UserRole
    );

    if (!canViewUsers) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const isActive = searchParams.get("isActive");
    const excludeTenant = searchParams.get("excludeTenant") === "true";

    // Build filter query
    const filter: any = {
      // Exclude soft-deleted users
      deletedAt: null,
    };

    // Search filter
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Role filter - support multiple roles separated by comma
    if (role) {
      const roles = role
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r);
      if (roles.length === 1) {
        filter.role = roles[0];
      } else if (roles.length > 1) {
        filter.role = { $in: roles };
      }
    }

    // Exclude tenants when requested and no specific role filter is applied
    if (excludeTenant) {
      if (!filter.role) {
        filter.role = { $ne: UserRole.TENANT };
      } else if (typeof filter.role === "string") {
        if (filter.role === UserRole.TENANT) {
          // Force no tenant results
          filter.role = { $ne: UserRole.TENANT };
        }
      } else if (filter.role && (filter.role as any).$in) {
        const rolesIn: string[] = (filter.role as any).$in.filter(
          (r: string) => r !== UserRole.TENANT
        );
        filter.role =
          rolesIn.length > 0 ? { $in: rolesIn } : { $ne: UserRole.TENANT };
      }
    }

    // Active status filter
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      filter.isActive = isActive === "true";
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get users with pagination
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -__v") // Exclude sensitive fields
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    // Calculate pagination info
    const pages = Math.ceil(total / limit);
    const hasNext = page < pages;
    const hasPrev = page > 1;

    return createSuccessResponse({
      users: users,
      pagination: {
        page,
        limit,
        total,
        pages,
        hasNext,
        hasPrev,
      },
    });
  } catch {
    return createErrorResponse("Failed to fetch users", 500);
  }
};

// ============================================================================
// POST /api/users - Create a new user (Admin only)
// ============================================================================

export const POST = async (request: NextRequest) => {
  try {
    // Connect to database
    await connectDB();

    // Check authentication and authorization
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Only admins can create users
    if (session.user.role !== UserRole.ADMIN) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const body = await request.json();

    // Basic validation
    if (!body.email || !body.password || !body.firstName || !body.lastName) {
      return createErrorResponse("Missing required fields", 400);
    }

    // Validate role (system role or existing custom role)
    if (body.role) {
      const isSystemRole = Object.values(UserRole).includes(body.role);
      if (!isSystemRole) {
        const roleExists = await Role.findOne({
          name: body.role,
          isActive: true,
          deletedAt: null,
        }).lean();
        if (!roleExists) {
          return createErrorResponse("Invalid role specified", 400);
        }
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: body.email });
    if (existingUser) {
      return createErrorResponse("User with this email already exists", 400);
    }

    // Create new user
    const newUser = new User({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      password: body.password, // Will be hashed by the model
      role: body.role || UserRole.TENANT,
      phone: body.phone || undefined,
      avatar: body.avatar || undefined,
      isActive: body.isActive !== undefined ? body.isActive : true,
    });

    const savedUser = await newUser.save();

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    const context = auditService.extractContextFromRequest(request, session?.user);

    await auditService.logEvent(
      {
        category: AuditCategory.USER_MANAGEMENT,
        action: AuditAction.CREATE,
        severity: AuditSeverity.LOW,
        description: `Created user: ${savedUser.firstName} ${savedUser.lastName}`,
        resourceType: "user",
        resourceId: savedUser._id.toString(),
        resourceName: `${savedUser.firstName} ${savedUser.lastName}`,
        newValues: {
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          email: savedUser.email,
          role: savedUser.role,
          isActive: savedUser.isActive,
        },
        tags: ["user", "create"],
      },
      context
    );

    return createSuccessResponse(
      { data: userResponse },
      "User created successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
};

// ============================================================================
// PUT /api/users - Bulk update users (Admin only)
// ============================================================================

export const PUT = withRoleAndDB([UserRole.ADMIN])(
  async (_user: AuthenticatedUser, request: NextRequest) => {
    try {
      const body = await request.json();
      const { userIds, updates } = body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return createErrorResponse("User IDs are required", 400);
      }

      if (!updates || typeof updates !== "object") {
        return createErrorResponse("Updates are required", 400);
      }

      // Remove sensitive fields from updates
      delete updates.password;
      delete updates._id;
      delete updates.__v;

      // Perform bulk update
      const result = await User.updateMany(
        { _id: { $in: userIds } },
        { $set: updates }
      );

      await auditService.logEvent(
        {
          category: AuditCategory.USER_MANAGEMENT,
          action: AuditAction.BULK_UPDATE,
          severity: AuditSeverity.MEDIUM,
          description: `Bulk updated ${userIds.length} users`,
          details: { userIds, updates },
          tags: ["user", "bulk_update"],
        },
        auditService.extractContextFromRequest(request, _user)
      );

      return createSuccessResponse({
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/users - Bulk deactivate users (Admin only)
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN])(
  async (_user: AuthenticatedUser, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const idsParam = searchParams.get("ids");

      if (!idsParam) {
        return createErrorResponse("User IDs are required", 400);
      }

      const userIds = idsParam.split(",");

      // Deactivate users instead of deleting them
      const result = await User.updateMany(
        { _id: { $in: userIds } },
        { $set: { isActive: false } }
      );

      await auditService.logEvent(
        {
          category: AuditCategory.USER_MANAGEMENT,
          action: AuditAction.BULK_DELETE,
          severity: AuditSeverity.HIGH,
          description: `Bulk deactivated ${userIds.length} users`,
          details: { userIds },
          tags: ["user", "bulk_deactivate"],
        },
        auditService.extractContextFromRequest(request, _user)
      );

      return createSuccessResponse({
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);
