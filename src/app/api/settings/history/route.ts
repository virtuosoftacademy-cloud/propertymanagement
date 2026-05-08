/**
 * PropertyPro - Settings History API Route
 * Track and retrieve settings change history and audit logs
 */

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
} from "@/lib/api-utils";
import mongoose from "mongoose";

// Settings History Schema
const settingsHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, required: true }, // 'profile', 'notifications', 'security', etc.
  action: { type: String, required: true }, // 'create', 'update', 'delete'
  field: { type: String, required: true }, // specific field that was changed
  oldValue: { type: mongoose.Schema.Types.Mixed }, // previous value
  newValue: { type: mongoose.Schema.Types.Mixed }, // new value
  metadata: {
    userAgent: String,
    ipAddress: String,
    sessionId: String,
    source: { type: String, default: "web" }, // 'web', 'mobile', 'api'
  },
  createdAt: { type: Date, default: Date.now },
});

settingsHistorySchema.index({ userId: 1, createdAt: -1 });
settingsHistorySchema.index({ category: 1, createdAt: -1 });

const SettingsHistory =
  (mongoose.models?.SettingsHistory as mongoose.Model<any>) ||
  mongoose.model("SettingsHistory", settingsHistorySchema);

// ============================================================================
// GET /api/settings/history - Get settings change history
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const category = searchParams.get("category");
    const action = searchParams.get("action");
    const field = searchParams.get("field");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;

    // Build query
    const query: any = {};

    // Regular users can only see their own history
    if (userRole !== UserRole.ADMIN) {
      query.userId = userId;
    } else {
      // Admins can see all history, or filter by specific user
      const targetUserId = searchParams.get("userId");
      if (targetUserId) {
        query.userId = targetUserId;
      }
    }

    if (category) query.category = category;
    if (action) query.action = action;
    if (field) query.field = field;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      SettingsHistory.find(query)
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SettingsHistory.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return createSuccessResponse({
      history,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      message: "Settings history retrieved successfully",
    });
  } catch (error) {
    console.error("Settings history error:", error);
    return handleApiError(error);
  }
}

// ============================================================================
// POST /api/settings/history - Log a settings change
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const body = await request.json();
    const { category, action, field, oldValue, newValue, metadata = {} } = body;

    if (!category || !action || !field) {
      return createErrorResponse(
        "Category, action, and field are required",
        400
      );
    }

    // Get request metadata
    const userAgent = request.headers.get("user-agent") || "";
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded
      ? forwarded.split(",")[0]
      : request.headers.get("x-real-ip") || "unknown";

    const historyEntry = await SettingsHistory.create({
      userId: session.user.id,
      category,
      action,
      field,
      oldValue,
      newValue,
      metadata: {
        ...metadata,
        userAgent,
        ipAddress,
        sessionId: session.user.id, // Could be enhanced with actual session ID
        source: metadata.source || "web",
      },
    });

    return createSuccessResponse({
      historyEntry,
      message: "Settings change logged successfully",
    });
  } catch (error) {
    console.error("Settings history logging error:", error);
    return handleApiError(error);
  }
}

// ============================================================================
// DELETE /api/settings/history - Clear settings history (admin only)
// ============================================================================
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const session = await auth();

    if (!session?.user?.id) {
      return createErrorResponse("Unauthorized", 401);
    }

    const userRole = session.user.role as UserRole;

    if (userRole !== UserRole.ADMIN) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const category = searchParams.get("category");
    const olderThan = searchParams.get("olderThan"); // days

    const query: any = {};

    if (userId) query.userId = userId;
    if (category) query.category = category;
    if (olderThan) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThan));
      query.createdAt = { $lt: cutoffDate };
    }

    const result = await SettingsHistory.deleteMany(query);

    return createSuccessResponse({
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} history entries`,
    });
  } catch (error) {
    console.error("Settings history deletion error:", error);
    return handleApiError(error);
  }
}

// Helper function to log settings changes (can be used by other API routes)
export async function logSettingsChange(
  userId: string,
  category: string,
  action: string,
  field: string,
  oldValue: any,
  newValue: any,
  metadata: any = {}
) {
  try {
    await SettingsHistory.create({
      userId,
      category,
      action,
      field,
      oldValue,
      newValue,
      metadata: {
        source: "api",
        ...metadata,
      },
    });
  } catch (error) {
    console.error("Failed to log settings change:", error);
    // Don't throw error to avoid breaking the main operation
  }
}
