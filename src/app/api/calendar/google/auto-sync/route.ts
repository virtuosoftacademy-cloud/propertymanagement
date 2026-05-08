/**
 * PropertyPro - Google Calendar Auto-Sync API
 * Manage automatic sync settings for Google Calendar
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { User } from "@/models";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withDatabase,
  parseRequestBody,
} from "@/lib/api-utils";
import { z } from "zod";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const autoSyncSchema = z.object({
  enabled: z.boolean(),
  calendarId: z.string().optional(),
  syncDirection: z.enum(["import", "export", "bidirectional"]).optional(),
  syncInterval: z.number().min(5).max(1440).optional(), // 5 minutes to 24 hours
});

// ============================================================================
// POST /api/calendar/google/auto-sync - Update auto-sync settings
// ============================================================================
export const POST = withDatabase(async (request: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    // Validate request body
    const validation = autoSyncSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse(
        `Validation failed: ${validation.error.errors
          .map((e) => e.message)
          .join(", ")}`,
        400
      );
    }

    const { enabled, calendarId, syncDirection, syncInterval } =
      validation.data;

    // Check if user has Google Calendar connected
    const user = await User.findById(session.user.id);
    if (!user?.integrations?.googleCalendar?.connected) {
      return createErrorResponse("Google Calendar not connected", 400);
    }

    // Update auto-sync settings
    const updateData: any = {
      "integrations.googleCalendar.autoSync": enabled,
    };

    if (calendarId) {
      updateData["integrations.googleCalendar.selectedCalendarId"] = calendarId;
    }

    if (syncDirection) {
      updateData["integrations.googleCalendar.syncDirection"] = syncDirection;
    }

    if (syncInterval) {
      updateData["integrations.googleCalendar.syncInterval"] = syncInterval;
    }

    await User.findByIdAndUpdate(session.user.id, {
      $set: updateData,
    });

    return createSuccessResponse(
      {
        autoSync: enabled,
        calendarId:
          calendarId || user.integrations.googleCalendar.selectedCalendarId,
        syncDirection:
          syncDirection ||
          user.integrations.googleCalendar.syncDirection ||
          "bidirectional",
        syncInterval:
          syncInterval || user.integrations.googleCalendar.syncInterval || 15,
      },
      "Auto-sync settings updated successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});

// ============================================================================
// GET /api/calendar/google/auto-sync - Get auto-sync settings
// ============================================================================
export const GET = withDatabase(async (request: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Get user's auto-sync settings
    const user = await User.findById(session.user.id);
    const integration = user?.integrations?.googleCalendar;

    if (!integration?.connected) {
      return createErrorResponse("Google Calendar not connected", 400);
    }

    return createSuccessResponse(
      {
        autoSync: integration.autoSync || false,
        calendarId: integration.selectedCalendarId || null,
        syncDirection: integration.syncDirection || "bidirectional",
        syncInterval: integration.syncInterval || 15,
        lastSync: integration.lastSync || null,
      },
      "Auto-sync settings retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});
