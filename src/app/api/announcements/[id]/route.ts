/**
 * PropertyPro - Announcement Detail API
 * Provides detailed announcement data, view tracking, and reactions
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Announcement } from "@/models";
import { UserRole } from "@/types";
import {
  createErrorResponse,
  createSuccessResponse,
  handleApiError,
  isValidObjectId,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import {
  addAnnouncementReaction,
  markAnnouncementAsViewed,
  removeAnnouncementReaction,
} from "../route";

const ANNOUNCEMENT_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT];

const POPULATE_FIELDS = [
  { path: "createdBy", select: "firstName lastName email" },
  { path: "targetAudience.propertyIds", select: "name address" },
];

function extractClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }
  return request.headers.get("x-real-ip") ?? undefined;
}

async function loadAnnouncement(id: string, userId: string) {
  const document = await Announcement.findById(id).populate(POPULATE_FIELDS);
  if (!document) {
    return null;
  }

  const announcementObject = document.toObject({ virtuals: true });
  const userReaction = document.reactions.find(
    (reaction: any) => reaction?.userId?.toString() === userId
  )?.type;
  const userHasViewed = document.views.some(
    (view: any) => view?.userId?.toString() === userId
  );

  return {
    ...announcementObject,
    id: document._id.toString(),
    userReaction: userReaction ?? null,
    userHasViewed,
  };
}

export const GET = withRoleAndDB(ANNOUNCEMENT_ROLES)(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid announcement ID", 400);
      }

      const url = new URL(request.url);
      const trackView = url.searchParams.get("trackView") !== "false";

      if (trackView) {
        const ipAddress = extractClientIp(request);
        await markAnnouncementAsViewed(id, user.id, ipAddress);
      }

      const announcement = await loadAnnouncement(id, user.id);
      if (!announcement) {
        return createErrorResponse("Announcement not found", 404);
      }

      return createSuccessResponse(
        { announcement },
        "Announcement retrieved successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const POST = withRoleAndDB(ANNOUNCEMENT_ROLES)(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid announcement ID", 400);
      }

      const { success, data, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error ?? "Invalid request body", 400);
      }

      const action = data?.action ?? "reaction";

      switch (action) {
        case "reaction": {
          const reactionType = data?.reactionType;
          if (
            !["like", "love", "helpful", "important"].includes(reactionType)
          ) {
            return createErrorResponse("Invalid reaction type", 400);
          }

          const result = await addAnnouncementReaction(
            id,
            user.id,
            reactionType
          );
          if (!result.success) {
            return createErrorResponse(
              result.error || "Failed to record reaction",
              400
            );
          }
          break;
        }
        case "markViewed": {
          const ipAddress = extractClientIp(request);
          const result = await markAnnouncementAsViewed(id, user.id, ipAddress);
          if (!result.success) {
            return createErrorResponse(
              result.error || "Failed to update view",
              400
            );
          }
          break;
        }
        default:
          return createErrorResponse("Unsupported action", 400);
      }

      const announcement = await loadAnnouncement(id, user.id);
      if (!announcement) {
        return createErrorResponse("Announcement not found", 404);
      }

      return createSuccessResponse(
        { announcement },
        action === "reaction"
          ? "Reaction updated successfully"
          : "Announcement marked as viewed"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const DELETE = withRoleAndDB(ANNOUNCEMENT_ROLES)(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid announcement ID", 400);
      }

      const url = new URL(request.url);
      const action = url.searchParams.get("action") ?? "reaction";

      switch (action) {
        case "reaction": {
          const result = await removeAnnouncementReaction(id, user.id);
          if (!result.success) {
            return createErrorResponse(
              result.error || "Failed to remove reaction",
              400
            );
          }
          break;
        }
        default:
          return createErrorResponse("Unsupported action", 400);
      }

      const announcement = await loadAnnouncement(id, user.id);
      if (!announcement) {
        return createErrorResponse("Announcement not found", 404);
      }

      return createSuccessResponse(
        { announcement },
        "Reaction removed successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
