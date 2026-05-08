/**
 * PropertyPro - Invoice API Routes
 * RESTful API endpoints for invoice management
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Invoice, Lease, Payment } from "@/models";
import { InvoiceStatus, InvoiceType } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
} from "@/lib/api-utils";
import { Types } from "mongoose";

// ============================================================================
// GET /api/invoices - List invoices with filtering
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const propertyId = searchParams.get("propertyId");
    const leaseId = searchParams.get("leaseId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sortBy = searchParams.get("sortBy") || "dueDate";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const search = (searchParams.get("search") || "").trim();

    // Build filter query
    const filter: any = {};

    if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
    if (propertyId) filter.propertyId = new Types.ObjectId(propertyId);
    if (leaseId) filter.leaseId = new Types.ObjectId(leaseId);
    if (status) {
      filter.status = status;
    } else {
      // Exclude fully paid invoices by default so only actionable items appear
      filter.balanceRemaining = { $gt: 0 };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // If a search term is provided, use aggregation to match across joined fields
    let invoices: any[] = [];
    let total = 0;

    if (search) {
      const matchStage: any = { ...filter };
      matchStage.$or = [{ deletedAt: null }, { deletedAt: { $exists: false } }];

      const pipeline: any[] = [
        { $match: matchStage },
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
              { invoiceNumber: { $regex: search, $options: "i" } },
              { "tenantId.firstName": { $regex: search, $options: "i" } },
              { "tenantId.lastName": { $regex: search, $options: "i" } },
              { "tenantId.email": { $regex: search, $options: "i" } },
              { "propertyId.name": { $regex: search, $options: "i" } },
              { notes: { $regex: search, $options: "i" } },
            ],
          },
        },
        { $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            metadata: [{ $count: "total" }],
          },
        },
        { $unwind: { path: "$metadata", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            invoices: "$data",
            total: { $ifNull: ["$metadata.total", 0] },
          },
        },
      ];

      const aggResult = await Invoice.aggregate(pipeline);
      invoices = aggResult[0]?.invoices || [];
      total = aggResult[0]?.total || 0;
    } else {
      const [docs, count] = await Promise.all([
        Invoice.find(filter)
          .populate("tenantId", "firstName lastName email")
          .populate("propertyId", "name address")
          .populate({
            path: "leaseId",
            select: "startDate endDate propertyId",
            populate: {
              path: "propertyId",
              select: "name address",
            },
          })
          .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Invoice.countDocuments(filter),
      ]);
      invoices = docs;
      total = count;
    }

    return createSuccessResponse(
      {
        invoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
      "Invoices retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error, "Failed to retrieve invoices");
  }
}

// ============================================================================
// POST /api/invoices - Create new invoice
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { leaseId, dueDate, lineItems, notes, issueDate = new Date() } = body;

    // Validate required fields
    if (!leaseId) {
      return createErrorResponse("Lease ID is required", 400);
    }

    if (!dueDate) {
      return createErrorResponse("Due date is required", 400);
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return createErrorResponse("At least one line item is required", 400);
    }

    // Validate lease exists
    const lease = await Lease.findById(leaseId).populate("tenantId propertyId");
    if (!lease) {
      return createErrorResponse("Lease not found", 404);
    }

    // Calculate totals
    const subtotal = lineItems.reduce(
      (sum: number, item: any) => sum + item.amount,
      0
    );
    const totalAmount = subtotal; // Add tax calculation if needed

    // Generate invoice number
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const invoiceNumber = `INV-${year}${month}-${random}`;

    // Create invoice
    const invoice = new Invoice({
      invoiceNumber,
      tenantId: lease.tenantId._id,
      propertyId: lease.propertyId._id,
      leaseId: lease._id,
      unitId: lease.unitId,
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      status: InvoiceStatus.SCHEDULED,
      subtotal,
      totalAmount,
      balanceRemaining: totalAmount,
      lineItems,
      gracePeriodEnd: new Date(
        new Date(dueDate).getTime() +
          (lease.terms?.paymentConfig?.lateFeeConfig?.gracePeriodDays || 5) *
            24 *
            60 *
            60 *
            1000
      ),
      notes,
    });

    await invoice.save();

    // Populate the response
    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate("tenantId", "firstName lastName email")
      .populate("propertyId", "name address")
      .populate({
        path: "leaseId",
        select: "startDate endDate propertyId",
        populate: {
          path: "propertyId",
          select: "name address",
        },
      });

    return createSuccessResponse(
      populatedInvoice,
      "Invoice created successfully",
      201
    );
  } catch (error) {
    return handleApiError(error, "Failed to create invoice");
  }
}

// ============================================================================
// PATCH /api/invoices - Bulk update invoices
// ============================================================================
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { invoiceIds, updates } = body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return createErrorResponse("Invoice IDs are required", 400);
    }

    if (!updates || typeof updates !== "object") {
      return createErrorResponse("Updates object is required", 400);
    }

    // Validate invoice IDs
    const objectIds = invoiceIds.map((id: string) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid invoice ID: ${id}`);
      }
      return new Types.ObjectId(id);
    });

    // Perform bulk update
    const result = await Invoice.updateMany(
      { _id: { $in: objectIds } },
      { $set: updates }
    );

    return createSuccessResponse(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      `Updated ${result.modifiedCount} invoices`
    );
  } catch (error) {
    return handleApiError(error, "Failed to update invoices");
  }
}

// ============================================================================
// DELETE /api/invoices - Bulk soft delete invoices
// ============================================================================
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const invoiceIds = searchParams.get("ids")?.split(",") || [];

    if (invoiceIds.length === 0) {
      return createErrorResponse("Invoice IDs are required", 400);
    }

    // Validate invoice IDs
    const objectIds = invoiceIds.map((id: string) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid invoice ID: ${id}`);
      }
      return new Types.ObjectId(id);
    });

    // Check if any invoices have payments
    const invoicesWithPayments = await Invoice.find({
      _id: { $in: objectIds },
      amountPaid: { $gt: 0 },
    });

    if (invoicesWithPayments.length > 0) {
      return createErrorResponse(
        "Cannot delete invoices that have received payments",
        400
      );
    }

    // Perform soft delete
    const result = await Invoice.updateMany(
      { _id: { $in: objectIds } },
      { $set: { deletedAt: new Date(), status: InvoiceStatus.CANCELLED } }
    );

    return createSuccessResponse(
      {
        deletedCount: result.modifiedCount,
      },
      `Deleted ${result.modifiedCount} invoices`
    );
  } catch (error) {
    return handleApiError(error, "Failed to delete invoices");
  }
}
