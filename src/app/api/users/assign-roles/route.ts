/**
 * PropertyPro - User Role Assignment API Routes
 * Bulk role assignment with validation and audit logging
 */

import { NextRequest } from "next/server";
import { Role, User } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
  isValidObjectId,
} from "@/lib/api-utils";
import { z } from "zod";
import mongoose from "mongoose";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const assignRolesSchema = z.object({
  userIds: z
    .array(z.string())
    .min(1, "At least one user ID is required")
    .max(100, "Cannot assign roles to more than 100 users at once"),
  targetRole: z.string().min(1, "Target role is required"),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
  notifyUsers: z.boolean().default(false),
});

// ============================================================================
// POST /api/users/assign-roles - Bulk assign roles to users
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Validate request body
      const validation = assignRolesSchema.safeParse(body);
      if (!validation.success) {
        return createErrorResponse(
          `Validation failed: ${validation.error.errors
            .map((e) => e.message)
            .join(", ")}`,
          400
        );
      }

      const { userIds, targetRole, reason, notifyUsers } = validation.data;

      // Validate user IDs
      const invalidUserIds = userIds.filter((id) => !isValidObjectId(id));
      if (invalidUserIds.length > 0) {
        return createErrorResponse(
          `Invalid user IDs: ${invalidUserIds.join(", ")}`,
          400
        );
      }

      // Validate target role exists (either system role or custom role)
      const isSystemRole = Object.values(UserRole).includes(
        targetRole as UserRole
      );
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

      // Get users to be updated
      const usersToUpdate = await User.find({
        _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
      }).select("_id firstName lastName email role");

      if (usersToUpdate.length === 0) {
        return createErrorResponse("No valid users found", 404);
      }

      if (usersToUpdate.length !== userIds.length) {
        const foundIds = usersToUpdate.map((u) => u._id.toString());
        const notFoundIds = userIds.filter((id) => !foundIds.includes(id));
        return createErrorResponse(
          `Users not found: ${notFoundIds.join(", ")}`,
          404
        );
      }

      // Track role changes for audit
      const roleChanges = usersToUpdate.map((u) => ({
        userId: u._id.toString(),
        userEmail: u.email,
        userName: `${u.firstName} ${u.lastName}`,
        previousRole: u.role,
        newRole: targetRole,
        changedBy: user.id,
        changedAt: new Date(),
        reason: reason || "Bulk role assignment",
      }));

      // Update users in a transaction
      const session = await mongoose.startSession();
      let result;

      try {
        await session.withTransaction(async () => {
          // Update user roles
          result = await User.updateMany(
            {
              _id: {
                $in: userIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
              isActive: true,
            },
            {
              $set: {
                role: targetRole,
                updatedAt: new Date(),
              },
            },
            { session }
          );

          // Update user counts for affected roles
          const affectedRoles = [
            ...new Set([...roleChanges.map((c) => c.previousRole), targetRole]),
          ];

          for (const roleName of affectedRoles) {
            // Skip system roles as they don't have user counts in the Role collection
            if (Object.values(UserRole).includes(roleName as UserRole)) {
              continue;
            }

            const userCount = await User.countDocuments(
              {
                role: roleName,
                isActive: true,
              },
              { session }
            );

            await Role.updateOne(
              { name: roleName, deletedAt: null },
              { $set: { userCount } },
              { session }
            );
          }

          // TODO: Create audit log entries
          // This would be implemented when audit logging is added

        });
      } finally {
        await session.endSession();
      }

      // TODO: Send notifications if requested
      if (notifyUsers) {

        // Implement email notifications here
      }

      // Prepare response with detailed information
      const response = {
        matchedCount: result?.matchedCount || 0,
        modifiedCount: result?.modifiedCount || 0,
        targetRole,
        affectedUsers: roleChanges.map((change) => ({
          userId: change.userId,
          userName: change.userName,
          email: change.userEmail,
          previousRole: change.previousRole,
          newRole: change.newRole,
        })),
        summary: {
          totalUsers: userIds.length,
          successfulUpdates: result?.modifiedCount || 0,
          failedUpdates: userIds.length - (result?.modifiedCount || 0),
        },
      };

      return createSuccessResponse(
        response,
        `Successfully assigned ${
          result?.modifiedCount || 0
        } users to ${targetRole} role`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// GET /api/users/assign-roles/preview - Preview role assignment changes
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const userIdsParam = searchParams.get("userIds");
      const targetRole = searchParams.get("targetRole");

      if (!userIdsParam || !targetRole) {
        return createErrorResponse(
          "userIds and targetRole parameters are required",
          400
        );
      }

      const userIds = userIdsParam.split(",").filter((id) => id.trim());

      if (userIds.length === 0) {
        return createErrorResponse("At least one user ID is required", 400);
      }

      // Validate user IDs
      const invalidUserIds = userIds.filter((id) => !isValidObjectId(id));
      if (invalidUserIds.length > 0) {
        return createErrorResponse(
          `Invalid user IDs: ${invalidUserIds.join(", ")}`,
          400
        );
      }

      // Validate target role
      const isSystemRole = Object.values(UserRole).includes(
        targetRole as UserRole
      );
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

      // Get users and their current roles
      const users = await User.find({
        _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
      }).select("_id firstName lastName email role");

      const preview = users.map((u) => ({
        userId: u._id.toString(),
        userName: `${u.firstName} ${u.lastName}`,
        email: u.email,
        currentRole: u.role,
        newRole: targetRole,
        willChange: u.role !== targetRole,
      }));

      const summary = {
        totalUsers: users.length,
        usersToChange: preview.filter((p) => p.willChange).length,
        usersAlreadyInRole: preview.filter((p) => !p.willChange).length,
        notFoundUsers: userIds.length - users.length,
      };

      return createSuccessResponse({
        preview,
        summary,
        targetRole,
        roleInfo: customRole
          ? {
              name: customRole.name,
              label: customRole.label,
              description: customRole.description,
              isCustomRole: true,
            }
          : {
              name: targetRole,
              label: targetRole.charAt(0).toUpperCase() + targetRole.slice(1),
              description: `System role: ${targetRole}`,
              isCustomRole: false,
            },
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);
