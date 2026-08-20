/**
 * PropertyPro - User deletion impact
 *
 * GET /api/users/[id]/impact
 *
 * Returns what would be stranded by permanently deleting this user, so the
 * history page can show it before the admin confirms. Read-only.
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
import { getUserDeletionImpact } from "@/lib/users/deletion-impact";

export async function GET(
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

    // Deleted or not — the preview is most useful precisely when the user has
    // already been soft deleted.
    const user =
      (await User.findOne({ _id: id, deletedAt: { $ne: null } })
        .select("firstName lastName email role")
        .lean()) ??
      (await User.findOne({ _id: id, deletedAt: null })
        .select("firstName lastName email role")
        .lean());

    if (!user) {
      return createErrorResponse("User not found", 404);
    }

    const impact = await getUserDeletionImpact(id);

    return createSuccessResponse({
      user: {
        id,
        name: `${(user as any).firstName ?? ""} ${
          (user as any).lastName ?? ""
        }`.trim(),
        email: (user as any).email,
        role: (user as any).role,
      },
      ...impact,
      canDeletePermanently: !impact.hasReferences,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
