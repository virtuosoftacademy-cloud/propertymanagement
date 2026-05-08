/**
 * PropertyPro - User Avatar API Routes
 * Handle user avatar upload and update
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { User } from "@/models";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
} from "@/lib/api-utils";
import { deleteFromR2 } from "@/lib/r2-server";
import { isR2Url, extractObjectKey } from "@/lib/r2";

// ============================================================================
// PUT /api/user/avatar - Update user avatar
// ============================================================================
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const { success, data: body, error } = await parseRequestBody(request);
    if (!success) {
      return createErrorResponse(error!, 400);
    }

    const { avatar } = body;

    if (!avatar || typeof avatar !== "string") {
      return createErrorResponse("Avatar URL is required", 400);
    }

    // Validate avatar format (URL only, preferably R2)
    try {
      new URL(avatar);
    } catch {
      return createErrorResponse("Invalid avatar URL format", 400);
    }

    // Get the current user to check for existing avatar
    const currentUser = await User.findById(session.user.id).select("avatar");
    if (!currentUser) {
      return createErrorResponse("User not found", 404);
    }

    // Delete old avatar from storage if it exists and is different from the new one
    if (currentUser.avatar && currentUser.avatar !== avatar) {
      try {
        // Extract object key from URL
        let objectKey: string | null = currentUser.avatar;
        if (
          currentUser.avatar.startsWith("http://") ||
          currentUser.avatar.startsWith("https://")
        ) {
          if (isR2Url(currentUser.avatar)) {
            objectKey = extractObjectKey(currentUser.avatar);
          } else {
            console.warn(`Skipping non-R2 URL: ${currentUser.avatar}`);
            objectKey = null;
          }
        }

        if (objectKey) {
          const deleted = await deleteFromR2(objectKey);
          if (deleted) {
          } else {
            console.warn(
              `Failed to delete old avatar from storage: ${currentUser.avatar}`
            );
          }
        }
      } catch (error) {
        console.error(
          `Error deleting old avatar from storage: ${currentUser.avatar}`,
          error
        );
        // Continue even if old avatar deletion fails
      }
    }

    // Update user avatar
    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      { avatar },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedUser) {
      return createErrorResponse("User not found", 404);
    }

    return createSuccessResponse({
      user: updatedUser,
      message: "Avatar updated successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
