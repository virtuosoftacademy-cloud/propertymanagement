/**
 * PropertyPro - Payments API Routes
 * CRUD operations for payment management
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { Payment, Property } from "@/models";
import { UserRole, PaymentStatus } from "@/types";
import {
  createSuccessResponse as createApiSuccessResponse,
  createErrorResponse as createApiErrorResponse,
} from "@/lib/api-utils";

// Helper functions
function createSuccessResponse(
  data: any,
  message: string,
  pagination?: any,
  status: number = 200
) {
  return createApiSuccessResponse(data, message, pagination);
}

function createErrorResponse(message: string, status: number = 400) {
  return createApiErrorResponse(message, status, message);
}

// GET /api/payments - Get all payments with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "12"), 100);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const propertyId = searchParams.get("propertyId");
    const tenantId = searchParams.get("tenantId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = (searchParams.get("search") || "").trim();
    const paymentMethod = searchParams.get("paymentMethod");

    // Build query based on user role and filters
    let query: any = {};
    const userRole = (session.user.role as UserRole) || UserRole.TENANT;

    // Role-based filtering for single company architecture
    switch (userRole) {
      case UserRole.TENANT:
        query.tenantId = session.user.id;
        break;
      case UserRole.ADMIN:
      case UserRole.MANAGER:
        // Admin and Manager can see all company payments
        break;
    }

    // Apply additional filters
    if (status && status !== "all") {
      if (status === PaymentStatus.OVERDUE) {
        query.status = {
          $in: [
            PaymentStatus.OVERDUE,
            PaymentStatus.LATE,
            PaymentStatus.SEVERELY_OVERDUE,
            PaymentStatus.GRACE_PERIOD,
            PaymentStatus.PENDING,
            PaymentStatus.FAILED,
            PaymentStatus.PARTIAL,
          ],
        };
      } else {
        query.status = status;
      }
    }
    if (type) query.type = type;
    if (propertyId && userRole !== UserRole.TENANT)
      query.propertyId = propertyId;
    if (tenantId && userRole !== UserRole.TENANT) query.tenantId = tenantId;
    if (paymentMethod && paymentMethod !== "all") query.paymentMethod = paymentMethod;

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query; if search provided, use aggregation to match across joined fields
    let payments: any[] = [];
    let total = 0;

    if (search) {
      const pipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: "users",
            localField: "tenantId",
            foreignField: "_id",
            as: "tenantId",
          },
        },
        { $unwind: { path: "$tenantId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "properties",
            localField: "propertyId",
            foreignField: "_id",
            as: "propertyId",
          },
        },
        { $unwind: { path: "$propertyId", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { "tenantId.firstName": { $regex: search, $options: "i" } },
              { "tenantId.lastName": { $regex: search, $options: "i" } },
              { "tenantId.email": { $regex: search, $options: "i" } },
              { "propertyId.name": { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
              { notes: { $regex: search, $options: "i" } },
            ],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            metadata: [{ $count: "total" }],
          },
        },
        { $unwind: { path: "$metadata", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            payments: "$data",
            total: { $ifNull: ["$metadata.total", 0] },
          },
        },
      ];

      const agg = await Payment.aggregate(pipeline);
      payments = agg[0]?.payments || [];
      total = agg[0]?.total || 0;
    } else {
      const [docs, count] = await Promise.all([
        Payment.find(query)
          .populate("propertyId", "name address")
          .populate("tenantId", "firstName lastName email phone")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments(query),
      ]);
      payments = docs;
      total = count;
    }

    const totalPages = Math.ceil(total / limit);

    return createSuccessResponse(
      payments,
      "Payments retrieved successfully",
      {
        page,
        limit,
        total,
        totalPages,
      }
    );
  } catch (error) {
    console.error("Error in GET /api/payments:", error);
    return createErrorResponse("Failed to fetch payments", 500);
  }
}

// POST /api/payments - Create a new payment
export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;

    // Check permissions
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const body = await request.json();

    // Basic validation
    if (!body.tenantId || !body.propertyId || !body.amount || !body.type) {
      return createErrorResponse("Missing required fields", 400);
    }

    if (body.amount <= 0 || body.amount > 100000) {
      return createErrorResponse(
        "Amount must be between $0.01 and $100,000",
        400
      );
    }

    // Verify property ownership for managers
    if (userRole === UserRole.MANAGER) {
      const property = await Property.findById(body.propertyId);
      if (!property) {
        return createErrorResponse("Property not found", 404);
      }

      const isOwner = property.ownerId?.toString() === session.user.id;
      const isManager = property.managerId?.toString() === session.user.id;

      if (!isOwner && !isManager) {
        return createErrorResponse(
          "You can only create payments for properties you own or manage",
          403
        );
      }
    }

    // Create the payment
    const payment = new Payment({
      ...body,
      createdBy: session.user.id,
      status: PaymentStatus.PENDING,
    });

    await payment.save();

    // Populate the response
    await payment.populate("propertyId", "name address");
    await payment.populate("tenantId", "firstName lastName email phone");

    return createSuccessResponse(
      payment,
      "Payment created successfully",
      undefined,
      201
    );
  } catch (error) {
    console.error("Error in POST /api/payments:", error);
    return createErrorResponse("Failed to create payment", 500);
  }
}

// PUT /api/payments - Bulk update payments (admin only)
export async function PUT(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;

    // Check permissions
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(userRole)) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const body = await request.json();
    const { paymentIds, updates } = body;

    if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      return createErrorResponse("Payment IDs are required", 400);
    }

    if (!updates || typeof updates !== "object") {
      return createErrorResponse("Updates object is required", 400);
    }

    // Update payments
    const result = await Payment.updateMany(
      { _id: { $in: paymentIds } },
      {
        $set: { ...updates, updatedBy: session.user.id, updatedAt: new Date() },
      }
    );

    return createSuccessResponse(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      `${result.modifiedCount} payments updated successfully`
    );
  } catch (error) {
    console.error("Error in PUT /api/payments:", error);
    return createErrorResponse("Failed to update payments", 500);
  }
}

// DELETE /api/payments - Bulk delete payments (admin only)
export async function DELETE(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;

    // Check permissions
    if (userRole !== UserRole.ADMIN) {
      return createErrorResponse("Insufficient permissions", 403);
    }

    const { searchParams } = new URL(request.url);
    const paymentIds = searchParams.get("ids")?.split(",");

    if (!paymentIds || paymentIds.length === 0) {
      return createErrorResponse("Payment IDs are required", 400);
    }

    // Delete payments (soft delete by updating status)
    const result = await Payment.updateMany(
      { _id: { $in: paymentIds } },
      {
        $set: {
          status: PaymentStatus.CANCELLED,
          deletedBy: session.user.id,
          deletedAt: new Date(),
        },
      }
    );

    return createSuccessResponse(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      `${result.modifiedCount} payments deleted successfully`
    );
  } catch (error) {
    console.error("Error in DELETE /api/payments:", error);
    return createErrorResponse("Failed to delete payments", 500);
  }
}
