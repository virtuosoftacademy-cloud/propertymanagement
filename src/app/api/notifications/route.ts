/**
 * PropertyPro - Notifications API
 * Handle notification management and automation rules
 */

import { NextRequest, NextResponse } from "next/server";
import { withRoleAndDB } from "@/lib/api-utils";
import { UserRole } from "@/types";
import {
  notificationService,
  NotificationType,
  NotificationPriority,
} from "@/lib/notification-service";
import { notificationAutomation } from "@/lib/notification-automation";
import {
  createErrorResponse,
  createSuccessResponse,
  parseRequestBody,
} from "@/lib/api-utils";
import Notification, { INotification } from "@/models/Notification";
import { Types } from "mongoose";

type NotificationRecord = {
  _id: Types.ObjectId;
  title: string;
  message: string;
  type: string;
  priority: INotification["priority"];
  read: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  actionUrl?: string | null;
  metadata?: Record<string, any>;
};

// GET /api/notifications - Get notification history and automation rules
export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
])(async (user, request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "automation-rules") {
      // Get automation rules
      const rules = notificationAutomation.getAllRules();
      return createSuccessResponse(rules);
    }

    if (type === "scheduled") {
      // Get scheduled notifications (placeholder - would fetch from database)
      const scheduledNotifications = []; // TODO: Implement database storage
      return createSuccessResponse(scheduledNotifications);
    }

    const includeRead = searchParams.get("includeRead") === "true";
    const status = searchParams.get("status");
    const limit = Math.min(
      Number.parseInt(searchParams.get("limit") || "20", 10) || 20,
      100
    );

    if (!Types.ObjectId.isValid(user.id)) {
      return createSuccessResponse({
        notifications: [],
        unreadCount: 0,
        totalCount: 0,
        metrics: {
          highPriority: 0,
          lastUpdated: null,
        },
      });
    }

    const userId = new Types.ObjectId(user.id);

    const filter: Record<string, any> = {
      userId,
    };

    if (status === "unread") {
      filter.read = false;
    } else if (status === "read") {
      filter.read = true;
    } else if (!includeRead) {
      filter.read = false;
    }

    const [notifications, unreadCount, totalCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean<NotificationRecord[]>(),
      Notification.countDocuments({ userId, read: false }),
      Notification.countDocuments({ userId }),
    ]);

    const serialized = notifications.map((notification) => ({
      id: notification._id?.toString() || "",
      title: notification.title,
      message: notification.message,
      type: notification.type,
      priority: notification.priority,
      read: notification.read,
      readAt: notification.readAt || null,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      actionUrl: notification.actionUrl,
      metadata: notification.metadata || {},
    }));

    return createSuccessResponse({
      notifications: serialized,
      unreadCount,
      totalCount,
      metrics: {
        highPriority: serialized.filter((n) =>
          ["high", "critical"].includes(n.priority)
        ).length,
        lastUpdated: serialized.length > 0 ? serialized[0].createdAt : null,
      },
    });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return createErrorResponse("Failed to fetch notifications", 500);
  }
});

// POST /api/notifications - Send notification or create automation rule
export const POST = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (user, request: NextRequest) => {
    try {
      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      const { action, ...data } = body;

      switch (action) {
        case "send-notification":
          return await handleSendNotification(data);

        case "create-automation-rule":
          return await handleCreateAutomationRule(data);

        case "schedule-notification":
          return await handleScheduleNotification(data);

        default:
          return createErrorResponse("Invalid action", 400);
      }
    } catch (error) {
      console.error("Failed to process notification request:", error);
      return createErrorResponse("Failed to process notification request", 500);
    }
  }
);

// PUT /api/notifications - Update automation rule
export const PUT = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
])(async (user, request: NextRequest) => {
  try {
    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    const { ruleId, enabled } = body;

    if (!ruleId) {
      return createErrorResponse("Rule ID is required", 400);
    }

    const updated = notificationAutomation.toggleRule(ruleId, enabled);

    if (!updated) {
      return createErrorResponse("Automation rule not found", 404);
    }

    return createSuccessResponse({
      message: `Automation rule ${enabled ? "enabled" : "disabled"}`,
      ruleId,
      enabled,
    });
  } catch (error) {
    console.error("Failed to update automation rule:", error);
    return createErrorResponse("Failed to update automation rule", 500);
  }
});

export const PATCH = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.TENANT,
])(async (user, request: NextRequest) => {
  try {
    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    if (!Types.ObjectId.isValid(user.id)) {
      return createErrorResponse("Invalid user identifier", 400);
    }

    const userId = new Types.ObjectId(user.id);
    const { notificationIds, read = true, markAll = false } = body || {};

    const update = {
      read,
      readAt: read ? new Date() : null,
    };

    let filter: Record<string, any> = { userId };

    if (!markAll) {
      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return createErrorResponse(
          "notificationIds is required unless markAll is true",
          400
        );
      }

      const validIds = notificationIds
        .filter((id: string) => Types.ObjectId.isValid(id))
        .map((id: string) => new Types.ObjectId(id));

      if (validIds.length === 0) {
        return createErrorResponse("No valid notification ids provided", 400);
      }

      filter = { ...filter, _id: { $in: validIds } };
    }

    const result = await Notification.updateMany(filter, { $set: update });

    return createSuccessResponse({
      modifiedCount: result.modifiedCount,
      read,
      markAll,
    });
  } catch (error) {
    console.error("Failed to update notifications:", error);
    return createErrorResponse("Failed to update notifications", 500);
  }
});

// DELETE /api/notifications - Delete automation rule
export const DELETE = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
])(async (user, request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
      return createErrorResponse("Rule ID is required", 400);
    }

    const deleted = notificationAutomation.removeRule(ruleId);

    if (!deleted) {
      return createErrorResponse("Automation rule not found", 404);
    }

    return createSuccessResponse({
      message: "Automation rule deleted",
      ruleId,
    });
  } catch (error) {
    console.error("Failed to delete automation rule:", error);
    return createErrorResponse("Failed to delete automation rule", 500);
  }
});

// Handle send notification
async function handleSendNotification(data: any): Promise<NextResponse> {
  const {
    type,
    priority = NotificationPriority.NORMAL,
    userId,
    title,
    message,
    notificationData = {},
  } = data;

  if (!type || !userId || !title || !message) {
    return createErrorResponse(
      "Missing required fields: type, userId, title, message",
      400
    );
  }

  const success = await notificationService.sendNotification({
    type: type as NotificationType,
    priority: priority as NotificationPriority,
    userId,
    title,
    message,
    data: notificationData,
  });

  if (success) {
    return createSuccessResponse({ message: "Notification sent successfully" });
  } else {
    return createErrorResponse("Failed to send notification", 500);
  }
}

// Handle create automation rule
async function handleCreateAutomationRule(data: any): Promise<NextResponse> {
  const { name, type, trigger, conditions, schedule, enabled = true } = data;

  if (!name || !type || !trigger || !conditions) {
    return createErrorResponse(
      "Missing required fields: name, type, trigger, conditions",
      400
    );
  }

  const ruleId = `custom_${Date.now()}`;

  notificationAutomation.addRule({
    id: ruleId,
    name,
    type: type as NotificationType,
    trigger,
    conditions,
    schedule,
    enabled,
  });

  return createSuccessResponse({
    message: "Automation rule created successfully",
    ruleId,
  });
}

// Handle schedule notification
async function handleScheduleNotification(data: any): Promise<NextResponse> {
  const { type, userId, scheduledFor, notificationData = {} } = data;

  if (!type || !userId || !scheduledFor) {
    return createErrorResponse(
      "Missing required fields: type, userId, scheduledFor",
      400
    );
  }

  const scheduledDate = new Date(scheduledFor);
  if (scheduledDate <= new Date()) {
    return createErrorResponse("Scheduled time must be in the future", 400);
  }

  const notificationId = await notificationService.scheduleNotification(
    type as NotificationType,
    userId,
    scheduledDate,
    notificationData
  );

  return createSuccessResponse({
    message: "Notification scheduled successfully",
    notificationId,
  });
}
