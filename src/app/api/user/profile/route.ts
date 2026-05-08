/**
 * PropertyPro - User Profile API Routes
 * CRUD operations for user profile management
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
import { userSchema } from "@/lib/validations";

const profileUpdateSchema = userSchema.omit({ password: true }).partial();

// ============================================================================
// GET /api/user/profile - Get current user profile
// ============================================================================
export async function GET() {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const user = await User.findById(session.user.id).select("-password");

    if (!user) {
      return createErrorResponse("User not found", 404);
    }

    return createSuccessResponse({
      user,
      message: "Profile retrieved successfully",
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return handleApiError(error);
  }
}

// ============================================================================
// PUT /api/user/profile - Update user profile
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

    // Validate the request body
    const validation = profileUpdateSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(", ");
      return createErrorResponse(`Validation failed: ${errors}`, 400);
    }

    const updateData = validation.data;

    // Check if email is being changed and if it's already taken
    if (updateData.email) {
      const existingUser = await User.findOne({
        email: updateData.email,
        _id: { $ne: session.user.id },
      });

      if (existingUser) {
        return createErrorResponse("Email already in use", 409);
      }
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      updateData,
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
      message: "Profile updated successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
