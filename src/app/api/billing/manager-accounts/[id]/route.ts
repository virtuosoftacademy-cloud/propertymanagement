/**
 * PropertyPro - Single manager account API
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { ManagerAccount } from "@/models";
import { UserRole } from "@/types";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import { managerAccountFormSchema } from "@/lib/billing/manager-account-schema";
import { serializeAccount } from "@/lib/billing/serialize";

function idFrom(context: any): string | null {
  const id = context?.params?.id;
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
    ? id
    : null;
}

export const GET = withRoleAndDB([UserRole.ADMIN])(
  async (_user, _request: NextRequest, context: any) => {
    try {
      const params = await context?.params;
      const id = idFrom({ params });
      if (!id) return createErrorResponse("Invalid account id", 400);

      const doc = await ManagerAccount.findById(id)
        .populate("managerUserId", "firstName lastName name")
        .lean();

      if (!doc) return createErrorResponse("Account not found", 404);

      return createSuccessResponse(serializeAccount(doc as any));
    } catch (error) {
      return handleApiError(error);
    }
  }
);

export const PATCH = withRoleAndDB([UserRole.ADMIN])(
  async (_user, request: NextRequest, context: any) => {
    try {
      const params = await context?.params;
      const id = idFrom({ params });
      if (!id) return createErrorResponse("Invalid account id", 400);

      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      const parsed = managerAccountFormSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const v = parsed.data;

      const updated = await ManagerAccount.findByIdAndUpdate(
        id,
        {
          clientName: v.clientName,
          companyName: v.companyName,
          contactEmail: v.contactEmail,
          contactPhone: v.contactPhone,
          managerUserId: v.clientUserId,
          planId: v.planId,
          status: v.status,
          amount: v.amount,
          billingCycle: v.billingCycle,
          startedAt: new Date(v.startedAt),
          renewsAt: v.renewsAt ? new Date(v.renewsAt) : null,
          notes: v.notes,
        },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) return createErrorResponse("Account not found", 404);

      return createSuccessResponse(
        serializeAccount(updated as any),
        "Manager account updated"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

/**
 * Soft delete, matching the model's convention. A hard delete would orphan the
 * payment rows that explain the revenue already reported for this account.
 */
export const DELETE = withRoleAndDB([UserRole.ADMIN])(
  async (_user, _request: NextRequest, context: any) => {
    try {
      const params = await context?.params;
      const id = idFrom({ params });
      if (!id) return createErrorResponse("Invalid account id", 400);

      const doc = await ManagerAccount.findById(id);
      if (!doc) return createErrorResponse("Account not found", 404);

      if (doc.stripeSubscriptionId) {
        return createErrorResponse(
          "This account is billed through Stripe. Cancel the subscription before removing it, or the customer will keep being charged.",
          409
        );
      }

      doc.deletedAt = new Date();
      await doc.save();

      return createSuccessResponse({ id }, "Manager account removed");
    } catch (error) {
      return handleApiError(error);
    }
  }
);
