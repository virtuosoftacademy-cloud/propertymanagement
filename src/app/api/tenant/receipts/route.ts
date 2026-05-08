/**
 * PropertyPro - Tenant Receipts API
 * Handles fetching and managing payment receipts for tenants
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { PaymentReceipt } from "@/models";
import { Payment } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse as createApiSuccessResponse,
  createErrorResponse as createApiErrorResponse,
} from "@/lib/api-utils";

// ============================================================================
// GET - Fetch tenant's payment receipts
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    await connectDB();

    // Build query to get payments for this tenant first
    const paymentQuery: any = { tenantId: session.user.id };

    if (startDate || endDate) {
      paymentQuery.paidDate = {};
      if (startDate) {
        paymentQuery.paidDate.$gte = new Date(startDate);
      }
      if (endDate) {
        paymentQuery.paidDate.$lte = new Date(endDate);
      }
    }

    // Get payment IDs for this tenant
    const payments = await Payment.find(paymentQuery, "_id").lean();
    const paymentIds = payments.map((p) => p._id);

    // Build receipt query
    const receiptQuery: any = { paymentId: { $in: paymentIds } };

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Fetch receipts
    const receipts = await PaymentReceipt.find(receiptQuery)
      .populate({
        path: "paymentId",
        select: "amount type dueDate paidDate propertyId",
        populate: {
          path: "propertyId",
          select: "name address",
        },
      })
      .sort({ generatedDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count
    const total = await PaymentReceipt.countDocuments(receiptQuery);
    const totalPages = Math.ceil(total / limit);

    return createApiSuccessResponse<{
      receipts: typeof receipts;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(
      {
        receipts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      "Receipts fetched successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch receipts";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// POST - Generate a new receipt (typically used by system after payment)
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

    // Only allow system/admin to generate receipts directly
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
    const { paymentId, emailSent = false } = body;

    if (!paymentId) {
      return createApiErrorResponse(
        "Payment ID is required",
        400,
        "Payment ID is required"
      );
    }

    await connectDB();

    // Verify payment exists
    const payment = await Payment.findById(paymentId)
      .populate("propertyId", "name address")
      .populate("tenantId", "name email");

    if (!payment) {
      return createApiErrorResponse(
        "Payment not found",
        404,
        "Payment not found"
      );
    }

    // Check if receipt already exists
    const existingReceipt = await PaymentReceipt.findOne({ paymentId });
    if (existingReceipt) {
      return createApiErrorResponse(
        "Receipt already exists for this payment",
        409,
        "Receipt already exists for this payment"
      );
    }

    // Generate receipt number
    const receiptNumber = await generateReceiptNumber();

    // Create receipt
    const receipt = new PaymentReceipt({
      paymentId,
      receiptNumber,
      generatedDate: new Date(),
      emailSent,
      downloadUrl: `/api/tenant/receipts/${paymentId}/download`,
    });

    await receipt.save();

    // Populate the response
    await receipt.populate({
      path: "paymentId",
      select: "amount type dueDate paidDate propertyId tenantId",
      populate: [
        { path: "propertyId", select: "name address" },
        { path: "tenantId", select: "name email" },
      ],
    });

    return createApiSuccessResponse<typeof receipt>(
      receipt,
      "Receipt generated successfully"
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate receipt";

    return createApiErrorResponse(errorMessage, 500, errorMessage);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function generateReceiptNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // Find the last receipt for this month
  const lastReceipt = await PaymentReceipt.findOne({
    receiptNumber: { $regex: `^${year}${month}` },
  })
    .sort({ receiptNumber: -1 })
    .lean();

  let sequence = 1;
  if (lastReceipt) {
    const lastSequence = parseInt(lastReceipt.receiptNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${year}${month}${String(sequence).padStart(4, "0")}`;
}
