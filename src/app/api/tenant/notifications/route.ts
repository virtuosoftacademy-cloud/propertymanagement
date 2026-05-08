/**
 * PropertyPro - Tenant Notifications API
 * Handles fetching and managing payment notifications for tenants
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PaymentNotification from "@/models/PaymentNotification";
import { UserRole } from "@/types";
import {
  createSuccessResponse as createApiSuccessResponse,
  createErrorResponse as createApiErrorResponse,
} from "@/lib/api-utils";

// ============================================================================
// GET - Fetch tenant's payment notifications
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse(
        "Authentication required",
        401,
        "Authentication required"
      );
    }

    if (session.user.role !== UserRole.TENANT) {
      return createApiErrorResponse(
        "Access denied. Tenant role required.",
        403,
        "Access denied. Tenant role required."
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    await connectDB();

    // Build query
    const query: any = { tenantId: session.user.id };

    if (type) {
      query.type = type;
    }

    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Fetch notifications
    const notifications = await PaymentNotification.find(query)
      .populate("paymentId", "amount type dueDate")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count
    const total = await PaymentNotification.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    return createApiSuccessResponse<{
      notifications: typeof notifications;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(
      {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      "Notifications fetched successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch notifications";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// POST - Create a new notification (typically used by system)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse(
        "Authentication required",
        401,
        "Authentication required"
      );
    }

    // Only allow system/admin to create notifications directly
    if (
      session.user.role !== UserRole.ADMIN &&
      session.user.role !== UserRole.MANAGER
    ) {
      return createApiErrorResponse(
        "Access denied. Admin or Property Manager role required.",
        403,
        "Access denied. Admin or Property Manager role required."
      );
    }

    const body = await request.json();
    const {
      tenantId,
      paymentId,
      type,
      scheduledDate,
      emailAddress,
      subject,
      message,
    } = body;

    // Validation
    if (
      !tenantId ||
      !paymentId ||
      !type ||
      !emailAddress ||
      !subject ||
      !message
    ) {
      return createApiErrorResponse(
        "Missing required fields",
        400,
        "Missing required fields"
      );
    }

    if (!["reminder", "overdue", "confirmation", "receipt"].includes(type)) {
      return createApiErrorResponse(
        "Invalid notification type",
        400,
        "Invalid notification type"
      );
    }

    await connectDB();

    // Create notification
    const notification = new PaymentNotification({
      tenantId,
      paymentId,
      type,
      status: "pending",
      scheduledDate: scheduledDate || new Date(),
      emailAddress,
      subject,
      message,
    });

    await notification.save();

    return createApiSuccessResponse<typeof notification>(
      notification,
      "Notification created successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create notification";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// PUT - Mark notifications as read (bulk operation)
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse(
        "Authentication required",
        401,
        "Authentication required"
      );
    }

    if (session.user.role !== UserRole.TENANT) {
      return createApiErrorResponse(
        "Access denied. Tenant role required.",
        403,
        "Access denied. Tenant role required."
      );
    }

    const body = await request.json();
    const { notificationIds, markAsRead = true } = body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return createApiErrorResponse(
        "Invalid notification IDs",
        400,
        "Invalid notification IDs"
      );
    }

    await connectDB();

    // Update notifications
    const result = await PaymentNotification.updateMany(
      {
        _id: { $in: notificationIds },
        tenantId: session.user.id,
      },
      {
        $set: {
          isRead: markAsRead,
          readAt: markAsRead ? new Date() : null,
        },
      }
    );

    return createApiSuccessResponse<{ modifiedCount: number }>(
      {
        modifiedCount: result.modifiedCount,
      },
      `${result.modifiedCount} notifications updated successfully`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update notifications";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// DELETE - Delete notifications (bulk operation)
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return createApiErrorResponse(
        "Authentication required",
        401,
        "Authentication required"
      );
    }

    if (session.user.role !== UserRole.TENANT) {
      return createApiErrorResponse(
        "Access denied. Tenant role required.",
        403,
        "Access denied. Tenant role required."
      );
    }

    const { searchParams } = new URL(request.url);
    const notificationIds = searchParams.get("ids")?.split(",");
    const deleteAll = searchParams.get("all") === "true";

    await connectDB();

    let result;

    if (deleteAll) {
      // Delete all notifications for the tenant
      result = await PaymentNotification.deleteMany({
        tenantId: session.user.id,
      });
    } else if (notificationIds && notificationIds.length > 0) {
      // Delete specific notifications
      result = await PaymentNotification.deleteMany({
        _id: { $in: notificationIds },
        tenantId: session.user.id,
      });
    } else {
      return createApiErrorResponse(
        "No notifications specified for deletion",
        400,
        "No notifications specified for deletion"
      );
    }

    return createApiSuccessResponse<{ deletedCount: number }>(
      {
        deletedCount: result.deletedCount,
      },
      `${result.deletedCount} notifications deleted successfully`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete notifications";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}
