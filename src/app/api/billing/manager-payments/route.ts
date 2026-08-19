/**
 * PropertyPro - Manager payments ledger API
 *
 * What has actually been received against manager accounts. Card rows are
 * written by the Stripe webhook; this endpoint records the cash ones.
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { ManagerAccount, ManagerPayment } from "@/models";
import { UserRole } from "@/types";
import type { ManagerPaymentsView } from "@/types/billing";
import {
  createSuccessResponse,
  createErrorResponse,
  handleApiError,
  parseRequestBody,
  withRoleAndDB,
} from "@/lib/api-utils";
import { serializePayment } from "@/lib/billing/serialize";
import { summarisePayments } from "@/lib/billing/summarise";

const recordPaymentSchema = z.object({
  accountId: z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), "Select an account"),
  amount: z
    .number({ invalid_type_error: "Enter an amount" })
    .positive("Amount must be greater than zero")
    .max(1_000_000, "Amount is too large"),
  receivedOn: z.string().min(1, "Received date is required"),
  periodLabel: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000, "Notes are too long").optional(),
});

// ============================================================================
// GET /api/billing/manager-payments
// ============================================================================

export const GET = withRoleAndDB([UserRole.ADMIN])(
  async (_user, request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const accountId = searchParams.get("accountId");

      const filter: Record<string, unknown> = {};
      if (accountId) {
        if (!mongoose.Types.ObjectId.isValid(accountId)) {
          return createErrorResponse("Invalid account id", 400);
        }
        filter.accountId = accountId;
      }

      // Newest first — a ledger is read from the most recent payment backwards.
      const docs = await ManagerPayment.find(filter)
        .sort({ receivedOn: -1 })
        .lean();

      const payments = (docs as any[]).map(serializePayment);

      const view: ManagerPaymentsView = {
        summary: summarisePayments(payments),
        payments,
      };

      return createSuccessResponse(view);
    } catch (error) {
      return handleApiError(error);
    }
  }
);

// ============================================================================
// POST /api/billing/manager-payments - record a cash payment
// ============================================================================

export const POST = withRoleAndDB([UserRole.ADMIN])(
  async (user, request: NextRequest) => {
    try {
      const body = await parseRequestBody(request);
      if (!body.success) return createErrorResponse(body.error!, 400);

      const parsed = recordPaymentSchema.safeParse(body.data);
      if (!parsed.success) {
        return createErrorResponse(
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const v = parsed.data;

      const account = await ManagerAccount.findById(v.accountId);
      if (!account) return createErrorResponse("Account not found", 404);

      if (account.stripeSubscriptionId) {
        return createErrorResponse(
          "This account is billed through Stripe. Its payments are written from Stripe invoices — recording one by hand would double-count the revenue.",
          409
        );
      }

      const receivedOn = new Date(v.receivedOn);
      if (Number.isNaN(receivedOn.getTime())) {
        return createErrorResponse("Invalid received date", 400);
      }

      const created = await ManagerPayment.create({
        accountId: account._id,
        // Denormalised deliberately: a historic row should keep saying what was
        // true when the money arrived, even if the account is later renamed.
        clientName: account.clientName,
        companyName: account.companyName,
        planId: account.planId,
        amount: v.amount,
        receivedOn,
        method: "cash",
        recordedBy:
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.email,
        periodLabel: v.periodLabel,
        notes: v.notes,
      });

      // A received payment is what makes an account current.
      account.lastPaymentAt = receivedOn;
      if (account.status === "past_due" || account.status === "pending") {
        account.status = "active";
      }
      await account.save();

      return createSuccessResponse(
        serializePayment(created as any),
        "Payment recorded"
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);
