/**
 * PropertyPro - Individual User API Routes
 * Handle operations for specific users
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { User } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  isValidObjectId,
} from "@/lib/api-utils";
import connectDB from "@/lib/mongodb";
import { auditService } from "@/lib/audit-service";
import { AuditCategory, AuditAction, AuditSeverity } from "@/models/AuditLog";
import { getUserDeletionImpact } from "@/lib/users/deletion-impact";

// ============================================================================
// GET /api/users/[id] - Get a specific user
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Connect to database
    await connectDB();

    // Check authentication
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

    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid user ID", 400);
    }

    // Find the user. `?deleted=true` opts into a soft-deleted record, which
    // the schema's pre-find hook otherwise filters out — the history page needs
    // this to open a deleted user's detail.
    const includeDeleted =
      new URL(request.url).searchParams.get("deleted") === "true";

    const targetUser = await User.findOne(
      includeDeleted
        ? { _id: id, deletedAt: { $ne: null } }
        : { _id: id, deletedAt: null }
    )
      .select("-password -__v")
      .lean();

    if (!targetUser) {
      return createErrorResponse("User not found", 404);
    }

    // Role-based access control
    if (session.user.role === UserRole.MANAGER) {
      // Managers can view all users except other admins
      if (
        targetUser.role === UserRole.ADMIN &&
        session.user.id !== targetUser._id
      ) {
        return createErrorResponse("Access denied", 403);
      }
    }

    return createSuccessResponse(targetUser);
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PUT /api/users/[id] - Update a specific user
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Connect to database
    await connectDB();

    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check if user has permission to manage users
    const canManageUsers = [UserRole.ADMIN, UserRole.MANAGER].includes(
      session.user.role as UserRole
    );

    if (!canManageUsers) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid user ID", 400);
    }

    const body = await request.json();

    // Find the target user
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return createErrorResponse("User not found", 404);
    }

    // Role-based access control
    if (session.user.role === UserRole.MANAGER) {
      // Managers can only update non-admin users
      if (
        targetUser.role === UserRole.ADMIN &&
        session.user.id !== targetUser._id
      ) {
        return createErrorResponse("Access denied", 403);
      }

      // Managers cannot change roles
      if (body.role && body.role !== targetUser.role) {
        return createErrorResponse("You cannot change user roles", 403);
      }
    }

    // Remove sensitive/protected fields
    delete body.password; // Password updates should go through separate endpoint
    delete body._id;
    delete body.__v;
    delete body.createdAt;
    delete body.updatedAt;

    const oldData = {
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      email: targetUser.email,
      role: targetUser.role,
      phone: targetUser.phone,
      avatar: targetUser.avatar,
      isActive: targetUser.isActive,
    };

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    ).select("-password -__v");

    if (!updatedUser) {
      return createErrorResponse("User not found", 404);
    }

    const newData = {
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedUser.role,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
      isActive: updatedUser.isActive,
    };

    const context = auditService.extractContextFromRequest(request, session.user);

    await auditService.logEvent(
      {
        category: AuditCategory.USER_MANAGEMENT,
        action: AuditAction.UPDATE,
        severity: AuditSeverity.LOW,
        description: `Updated user: ${updatedUser.firstName} ${updatedUser.lastName}`,
        resourceType: "user",
        resourceId: id,
        resourceName: `${updatedUser.firstName} ${updatedUser.lastName}`,
        oldValues: oldData,
        newValues: newData,
        tags: ["user", "update"],
      },
      context
    );

    if (body.role && body.role !== targetUser.role) {
      await auditService.logEvent(
        {
          category: AuditCategory.USER_MANAGEMENT,
          action: AuditAction.ROLE_ASSIGNED,
          severity: AuditSeverity.MEDIUM,
          description: `Changed role for ${updatedUser.firstName} ${updatedUser.lastName}`,
          resourceType: "user",
          resourceId: id,
          resourceName: `${updatedUser.firstName} ${updatedUser.lastName}`,
          details: { oldRole: targetUser.role, newRole: body.role },
          tags: ["user", "role"],
        },
        context
      );
    }

    return createSuccessResponse(updatedUser, "User updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// DELETE /api/users/[id] - Deactivate a specific user
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Connect to database
    await connectDB();

    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Check if user has permission to delete users (Admin only)
    if (session.user.role !== UserRole.ADMIN) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid user ID", 400);
    }

    // Prevent self-deletion
    if (id === session.user.id) {
      return createErrorResponse("You cannot deactivate yourself", 400);
    }

    const context = auditService.extractContextFromRequest(request, session.user);

    // ---- Permanent delete -------------------------------------------------
    // Irreversible, so it is gated three ways: the user must already be soft
    // deleted, nothing may still reference them, and the caller has to ask for
    // it explicitly.
    const permanent =
      new URL(request.url).searchParams.get("permanent") === "true";

    if (permanent) {
      const victim = await User.findOne({ _id: id, deletedAt: { $ne: null } })
        .select("-password -__v")
        .lean();

      if (!victim) {
        return createErrorResponse(
          "User not found, or not deleted yet. Delete the user first, then remove them permanently from the history page.",
          404
        );
      }

      const impact = await getUserDeletionImpact(id);
      if (impact.hasReferences) {
        return createErrorResponse(
          `Cannot permanently delete: ${impact.blockingTotal} record(s) still reference this user (${impact.entries
            .filter((e) => e.blocking)
            .map((e) => `${e.count} ${e.label.toLowerCase()}`)
            .join(", ")}). Reassign or remove them first.`,
          409
        );
      }

      await User.deleteOne({ _id: id });

      await auditService.logEvent(
        {
          category: AuditCategory.USER_MANAGEMENT,
          action: AuditAction.DELETE,
          severity: AuditSeverity.CRITICAL,
          description: `Permanently deleted user: ${(victim as any).firstName} ${
            (victim as any).lastName
          }`,
          resourceType: "user",
          resourceId: id,
          resourceName: `${(victim as any).firstName} ${(victim as any).lastName}`,
          oldValues: { email: (victim as any).email },
          tags: ["user", "permanent_delete"],
        },
        context
      );

      return createSuccessResponse(
        { deletedUserId: id },
        "User permanently deleted"
      );
    }

    // ---- Deactivate (default, reversible) ---------------------------------
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    ).select("-password -__v");

    if (!updatedUser) {
      return createErrorResponse("User not found", 404);
    }

    await auditService.logEvent(
      {
        category: AuditCategory.USER_MANAGEMENT,
        action: AuditAction.DELETE,
        severity: AuditSeverity.HIGH,
        description: `Deactivated user: ${updatedUser.firstName} ${updatedUser.lastName}`,
        resourceType: "user",
        resourceId: id,
        resourceName: `${updatedUser.firstName} ${updatedUser.lastName}`,
        oldValues: { isActive: true },
        newValues: { isActive: false },
        tags: ["user", "deactivate"],
      },
      context
    );

    return createSuccessResponse(updatedUser, "User deactivated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PATCH /api/users/[id] - Soft delete or restore a user
// ============================================================================
//
// Soft delete sets deletedAt and clears isActive, moving the user off the main
// list and onto the history page, where they can be restored or (once nothing
// references them) removed permanently.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Unauthorized", 401);
    }

    if (session.user.role !== UserRole.ADMIN) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { id } = await params;

    if (!isValidObjectId(id)) {
      return createErrorResponse("Invalid user ID", 400);
    }

    if (id === session.user.id) {
      return createErrorResponse("You cannot delete yourself", 400);
    }

    const body = await request.json().catch(() => null);
    const action = body?.action;

    if (action !== "soft-delete" && action !== "restore") {
      return createErrorResponse(
        'Invalid action. Expected "soft-delete" or "restore".',
        400
      );
    }

    // Look the user up regardless of delete state. Both queries name deletedAt
    // at the top level, which is what escapes the schema's pre-find hook — an
    // $or wrapper would not, since the hook only inspects top-level keys.
    const user =
      (await User.findOne({ _id: id, deletedAt: null })) ??
      (await User.findOne({ _id: id, deletedAt: { $ne: null } }));

    if (!user) {
      return createErrorResponse("User not found", 404);
    }

    const context = auditService.extractContextFromRequest(
      request,
      session.user
    );

    if (action === "soft-delete") {
      if (user.deletedAt) {
        return createErrorResponse("User is already deleted", 409);
      }

      await user.softDelete();

      await auditService.logEvent(
        {
          category: AuditCategory.USER_MANAGEMENT,
          action: AuditAction.DELETE,
          severity: AuditSeverity.HIGH,
          description: `Deleted user: ${user.firstName} ${user.lastName}`,
          resourceType: "user",
          resourceId: id,
          resourceName: `${user.firstName} ${user.lastName}`,
          newValues: { deletedAt: new Date() },
          tags: ["user", "soft_delete"],
        },
        context
      );

      return createSuccessResponse({ id }, "User deleted successfully");
    }

    // restore
    if (!user.deletedAt) {
      return createErrorResponse("User is not deleted", 409);
    }

    await user.restore();

    await auditService.logEvent(
      {
        category: AuditCategory.USER_MANAGEMENT,
        action: AuditAction.UPDATE,
        severity: AuditSeverity.MEDIUM,
        description: `Restored user: ${user.firstName} ${user.lastName}`,
        resourceType: "user",
        resourceId: id,
        resourceName: `${user.firstName} ${user.lastName}`,
        newValues: { deletedAt: null, isActive: true },
        tags: ["user", "restore"],
      },
      context
    );

    return createSuccessResponse({ id }, "User restored successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
