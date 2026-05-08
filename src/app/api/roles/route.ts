/**
 * PropertyPro - Role Management API Routes
 * CRUD operations for custom roles and permissions
 */

import { NextRequest } from "next/server";
import { Role, User } from "@/models";
import { UserRole, IRoleConfig } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
  createPaginationInfo,
} from "@/lib/api-utils";
import { z } from "zod";
import mongoose from "mongoose";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createRoleSchema = z.object({
  name: z
    .string()
    .min(1, "Role name is required")
    .max(50, "Role name cannot exceed 50 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Role name can only contain lowercase letters, numbers, and underscores"
    ),
  label: z
    .string()
    .min(1, "Role label is required")
    .max(100, "Role label cannot exceed 100 characters"),
  description: z
    .string()
    .min(1, "Role description is required")
    .max(500, "Role description cannot exceed 500 characters"),
  permissions: z
    .array(z.string())
    .min(1, "At least one permission is required"),
  color: z
    .enum(["default", "destructive", "outline", "secondary"])
    .default("outline"),
  isActive: z.boolean().default(true),
});

const updateRoleSchema = createRoleSchema.partial().omit({ name: true });

// ============================================================================
// GET /api/roles - List all roles
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "50");
      const includeSystem = searchParams.get("includeSystem") === "true";
      const includeInactive = searchParams.get("includeInactive") === "true";
      const search = searchParams.get("search") || "";

      // Build query
      const query: any = {};

      if (!includeInactive) {
        query.isActive = true;
        query.deletedAt = null;
      }

      if (!includeSystem) {
        query.isSystem = false;
      }

      if (search) {
        query.$or = [
          { label: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ];
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Execute queries
      const [roles, total] = await Promise.all([
        Role.find(query)
          .populate("createdBy", "firstName lastName email")
          .populate("updatedBy", "firstName lastName email")
          .sort({ isSystem: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Role.countDocuments(query),
      ]);

      // Get user counts for each role
      const roleNames = roles.map((role) => role.name);
      const userCounts = await User.aggregate([
        { $match: { role: { $in: roleNames }, isActive: true } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]);

      const userCountMap = userCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>);

      // Transform roles to include computed fields
      const transformedRoles: IRoleConfig[] = roles.map((role) => ({
        _id: role._id.toString(),
        name: role.name,
        label: role.label,
        description: role.description,
        permissions: role.permissions,
        isSystem: role.isSystem,
        isActive: role.isActive,
        color: role.color,
        userCount: userCountMap[role.name] || 0,
        canEdit: !role.isSystem,
        canDelete: !role.isSystem && (userCountMap[role.name] || 0) === 0,
        createdBy: role.createdBy?._id?.toString(),
        updatedBy: role.updatedBy?._id?.toString(),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      }));

      // Synthesize system roles when requested, even if not stored in DB
      if (includeSystem) {
        const systemRoleNames = Object.values(UserRole) as string[];
        const existingNames = new Set(transformedRoles.map((r) => r.name));
        const syntheticSystemRoles: IRoleConfig[] = systemRoleNames
          .filter((name) => !existingNames.has(name))
          .map((name) => ({
            name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
            description: `System role: ${name}`,
            permissions: [], // server returns empty; clients map permissions locally
            isSystem: true,
            isActive: true,
            color:
              name === UserRole.ADMIN
                ? "destructive"
                : name === UserRole.MANAGER
                ? "default"
                : "outline",
            userCount: 0,
            canEdit: false,
            canDelete: false,
          }));
        transformedRoles.push(...syntheticSystemRoles);
      }

      const pagination = createPaginationInfo(page, limit, total);

      return createSuccessResponse({
        roles: transformedRoles,
        pagination,
        total,
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// POST /api/roles - Create a new role
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Validate request body
      const validation = createRoleSchema.safeParse(body);
      if (!validation.success) {
        return createErrorResponse(
          `Validation failed: ${validation.error.errors
            .map((e) => e.message)
            .join(", ")}`,
          400
        );
      }

      const roleData = validation.data;

      // Check if role name already exists
      const existingRole = await Role.findOne({
        name: roleData.name,
        deletedAt: null,
      });

      if (existingRole) {
        return createErrorResponse("Role with this name already exists", 409);
      }

      // Create new role
      const newRole = new Role({
        ...roleData,
        createdBy: new mongoose.Types.ObjectId(user.id),
        updatedBy: new mongoose.Types.ObjectId(user.id),
      });

      let savedRole;
      try {
        savedRole = await newRole.save();
      } catch (saveError: any) {
        // Handle MongoDB duplicate key error
        if (saveError.code === 11000) {
          return createErrorResponse(
            "A role with this name already exists. Please choose a different name.",
            409
          );
        }
        throw saveError;
      }

      // Transform response
      const roleResponse: IRoleConfig = {
        _id: savedRole._id.toString(),
        name: savedRole.name,
        label: savedRole.label,
        description: savedRole.description,
        permissions: savedRole.permissions,
        isSystem: savedRole.isSystem,
        isActive: savedRole.isActive,
        color: savedRole.color,
        userCount: 0,
        canEdit: true,
        canDelete: true,
        createdBy: user.id,
        updatedBy: user.id,
        createdAt: savedRole.createdAt,
        updatedAt: savedRole.updatedAt,
      };

      return createSuccessResponse(
        { role: roleResponse },
        "Role created successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/roles - Bulk update roles (for role assignment)
// ============================================================================

export const PUT = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      const { userIds, targetRole } = body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return createErrorResponse("User IDs are required", 400);
      }

      if (!targetRole) {
        return createErrorResponse("Target role is required", 400);
      }

      // Validate target role exists (either system role or custom role)
      const isSystemRole = Object.values(UserRole).includes(targetRole);
      let customRole = null;

      if (!isSystemRole) {
        customRole = await Role.findOne({
          name: targetRole,
          isActive: true,
          deletedAt: null,
        });

        if (!customRole) {
          return createErrorResponse("Invalid target role", 400);
        }
      }

      // Update users
      const result = await User.updateMany(
        {
          _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
          isActive: true,
        },
        {
          $set: {
            role: targetRole,
            updatedAt: new Date(),
          },
        }
      );

      // Update user counts for affected roles
      if (customRole) {
        const userCount = await User.countDocuments({
          role: targetRole,
          isActive: true,
        });
        await Role.updateOne({ _id: customRole._id }, { $set: { userCount } });
      }

      return createSuccessResponse(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          targetRole,
        },
        `Successfully assigned ${result.modifiedCount} users to ${targetRole} role`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
