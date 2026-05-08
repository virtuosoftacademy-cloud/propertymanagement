/**
 * PropertyPro - Individual Payment API Routes
 * CRUD operations for individual payments with Stripe integration
 */

import { NextRequest } from "next/server";
import { Payment, Tenant } from "@/models";
import { UserRole, PaymentStatus } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  withRoleAndDB,
  parseRequestBody,
  isValidObjectId,
} from "@/lib/api-utils";
import { paymentSchema, validateSchema } from "@/lib/validations";

// ============================================================================
// GET /api/payments/[id] - Get a specific payment
// ============================================================================

const resolveId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (record._id) {
      return resolveId(record._id);
    }

    if (record.id) {
      return resolveId(record.id);
    }

    if (typeof record.toString === "function") {
      const str = record.toString();
      return str === "[object Object]" ? null : str;
    }
  }

  if (typeof value === "function") {
    return null;
  }

  try {
    return String(value);
  } catch (error) {
    return null;
  }
};

export const GET = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
  UserRole.TENANT,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid payment ID", 400);
      }

      // Find the payment
      const payment = await Payment.findById(id)
        .populate("tenantId", "firstName lastName email phone")
        .populate("propertyId", "name address type ownerId managerId")
        .populate("leaseId", "startDate endDate status")
        .lean();

      if (!payment) {
        return createErrorResponse("Payment not found", 404);
      }

      // Skip property check for admin users
      if (user.role === UserRole.ADMIN) {
        return createSuccessResponse(payment, "Payment retrieved successfully");
      }

      // For non-admin users, check property association
      if (!payment.propertyId) {
        return createErrorResponse("Payment is not linked to a property", 404);
      }

      const tenantId = resolveId(payment.tenantId);
      const property = payment.propertyId as Record<string, unknown> | null;
      const propertyOwnerId = property ? resolveId(property.ownerId) : null;
      const propertyManagerId = property ? resolveId(property.managerId) : null;

      // Role-based authorization
      if (user.role === UserRole.TENANT) {
        if (!tenantId || tenantId !== user.id) {
          return createErrorResponse(
            "You can only view your own payments",
            403
          );
        }
      }
      // Single company architecture - Managers can view all payments

      return createSuccessResponse(payment, "Payment retrieved successfully");
    } catch (error) {
      console.error("Payment GET Error:", error);
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PUT /api/payments/[id] - Update a specific payment
// ============================================================================

export const PUT = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid payment ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Find the payment
      const payment = await Payment.findById(id);
      if (!payment) {
        return createErrorResponse("Payment not found", 404);
      }

      // Prevent updating completed payments
      if (payment.status === PaymentStatus.COMPLETED) {
        return createErrorResponse("Cannot update completed payment", 400);
      }

      // Validate update data (partial schema)
      const updateSchema = paymentSchema.partial();
      const validation = validateSchema(updateSchema, body);
      if (!validation.success) {
        return createErrorResponse(validation.errors.join(", "), 400);
      }

      const updateData = validation.data;

      // Prevent certain fields from being updated
      delete updateData.tenantId;
      delete updateData.propertyId;
      delete updateData.stripePaymentIntentId;

      // Update the payment
      Object.assign(payment, updateData);
      await payment.save();

      // Populate tenant and property information
      await payment.populate([
        {
          path: "tenantId",
          select: "firstName lastName email phone",
        },
        {
          path: "propertyId",
          select: "name address type",
        },
        {
          path: "leaseId",
          select: "startDate endDate status",
        },
      ]);

      return createSuccessResponse(payment, "Payment updated successfully");
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// DELETE /api/payments/[id] - Delete a specific payment
// ============================================================================

export const DELETE = withRoleAndDB([UserRole.ADMIN, UserRole.MANAGER])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid payment ID", 400);
      }

      // Find the payment
      const payment = await Payment.findById(id);
      if (!payment) {
        return createErrorResponse("Payment not found", 404);
      }

      // Prevent deleting completed payments
      if (payment.status === PaymentStatus.COMPLETED) {
        return createErrorResponse(
          "Cannot delete completed payment. Please refund it first.",
          409
        );
      }

      // Perform soft delete
      payment.deletedAt = new Date();
      await payment.save();

      return createSuccessResponse(
        { id: payment._id },
        "Payment deleted successfully"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// PATCH /api/payments/[id] - Partial update (status change, etc.)
// ============================================================================

export const PATCH = withRoleAndDB([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MANAGER,
  UserRole.TENANT,
])(
  async (
    user,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return createErrorResponse("Invalid payment ID", 400);
      }

      const { success, data: body, error } = await parseRequestBody(request);
      if (!success) {
        return createErrorResponse(error!, 400);
      }

      // Find the payment
      const payment = await Payment.findById(id);
      if (!payment) {
        return createErrorResponse("Payment not found", 404);
      }

      // Role-based authorization for tenant actions
      if (user.role === UserRole.TENANT) {
        if (!payment.tenantId.equals(user.id)) {
          return createErrorResponse(
            "You can only modify your own payments",
            403
          );
        }
      }

      // Handle specific patch operations
      const { action, ...data } = body;

      switch (action) {
        case "markAsPaid":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse(
              "Tenants cannot mark payments as paid",
              403
            );
          }
          payment.status = PaymentStatus.COMPLETED;
          payment.paidDate = data.paidDate
            ? new Date(data.paidDate)
            : new Date();
          break;

        case "markAsFailed":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse(
              "Tenants cannot mark payments as failed",
              403
            );
          }
          payment.status = PaymentStatus.FAILED;
          break;

        case "processPayment":
          payment.status = PaymentStatus.PROCESSING;
          if (data.stripePaymentIntentId) {
            payment.stripePaymentIntentId = data.stripePaymentIntentId;
          }
          break;

        case "refund":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse("Tenants cannot refund payments", 403);
          }
          if (payment.status !== PaymentStatus.COMPLETED) {
            return createErrorResponse(
              "Can only refund completed payments",
              400
            );
          }
          payment.status = PaymentStatus.REFUNDED;
          break;

        case "updateAmount":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse(
              "Tenants cannot update payment amounts",
              403
            );
          }
          if (payment.status === PaymentStatus.COMPLETED) {
            return createErrorResponse(
              "Cannot update amount of completed payment",
              400
            );
          }
          if (!data.amount || data.amount <= 0) {
            return createErrorResponse("Valid amount is required", 400);
          }
          payment.amount = data.amount;
          break;

        case "updateDueDate":
          if (user.role === UserRole.TENANT) {
            return createErrorResponse("Tenants cannot update due dates", 403);
          }
          if (!data.dueDate) {
            return createErrorResponse("Due date is required", 400);
          }
          payment.dueDate = new Date(data.dueDate);
          break;

        case "addNote":
          if (!data.description) {
            return createErrorResponse("Description is required", 400);
          }
          payment.description = data.description;
          break;

        default:
          return createErrorResponse("Invalid action", 400);
      }

      await payment.save();

      return createSuccessResponse(
        payment,
        `Payment ${action} completed successfully`
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
