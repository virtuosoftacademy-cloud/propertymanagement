/**
 * PropertyPro - Tenant Invoices API
 * API endpoint for tenants to view their invoices
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Invoice } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
} from "@/lib/api-utils";

// GET /api/tenant/invoices - Get tenant's invoices
export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get session
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse("Authentication required", 401);
    }

    const userRole = (session.user.role as UserRole) || UserRole.TENANT;
    const userId = session.user.id;

    // Only allow tenants to access this endpoint
    if (userRole !== UserRole.TENANT) {
      return createErrorResponse("This endpoint is for tenants only", 403);
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const status = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "dueDate";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build query
    const query: any = {
      tenantId: userId,
    };

    if (status && status !== "all") {
      query.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Fetch invoices with pagination
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate("propertyId", "name address")
        .populate("leaseId", "startDate endDate")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(query),
    ]);

    // Calculate pagination info
    const pages = Math.ceil(total / limit);
    const hasNext = page < pages;
    const hasPrev = page > 1;

    // Calculate days overdue for overdue invoices
    const now = new Date();
    const enrichedInvoices = invoices.map((invoice) => {
      let daysOverdue = undefined;
      if (invoice.status === "overdue" && invoice.dueDate) {
        const diffTime = now.getTime() - new Date(invoice.dueDate).getTime();
        daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
      return {
        ...invoice,
        daysOverdue,
      };
    });

    // Calculate summary statistics
    const summary = {
      total: total,
      totalAmount: invoices.reduce(
        (sum, inv) => sum + (inv.totalAmount || 0),
        0
      ),
      amountPaid: invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0),
      balanceRemaining: invoices.reduce(
        (sum, inv) => sum + (inv.balanceRemaining || 0),
        0
      ),
      byStatus: {
        scheduled: invoices.filter((inv) => inv.status === "scheduled").length,
        issued: invoices.filter((inv) => inv.status === "issued").length,
        partial: invoices.filter((inv) => inv.status === "partial").length,
        paid: invoices.filter((inv) => inv.status === "paid").length,
        overdue: invoices.filter((inv) => inv.status === "overdue").length,
        cancelled: invoices.filter((inv) => inv.status === "cancelled").length,
      },
    };

    return createSuccessResponse(
      {
        invoices: enrichedInvoices,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext,
          hasPrev,
        },
        summary,
      },
      "Invoices retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
