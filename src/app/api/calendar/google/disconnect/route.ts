/**
 * PropertyPro - Google Calendar Disconnect API
 * Disconnect Google Calendar integration
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
} from "@/lib/api-utils";

// ============================================================================
// POST /api/calendar/google/disconnect - Disconnect Google Calendar
// ============================================================================
export const POST = withDatabase(async (request: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    // Remove Google Calendar integration data from user
    await User.findByIdAndUpdate(session.user.id, {
      $unset: {
        "integrations.googleCalendar": 1,
      },
    });

    return createSuccessResponse(
      { disconnected: true },
      "Google Calendar disconnected successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
});
