/**
 * PropertyPro - Mongoose → DTO mapping for manager billing
 *
 * The API returns the shapes in src/types/billing.ts, not raw documents: ids
 * become strings, dates become ISO strings, and nothing internal (deletedAt,
 * __v) leaks to the client. Kept in one place so a field added to a model has a
 * single obvious spot to be exposed from.
 */

import type { IManagerAccount } from "@/models/ManagerAccount";
import type { IManagerPayment } from "@/models/ManagerPayment";
import type { ManagerAccount, ManagerPayment } from "@/types/billing";

/** A populated managerUserId, when the query asked for one. */
type MaybePopulatedUser =
  | { _id: unknown; firstName?: string; lastName?: string; name?: string }
  | unknown;

function populatedName(value: MaybePopulatedUser): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const u = value as { firstName?: string; lastName?: string; name?: string };
  if (u.name) return u.name;
  const joined = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return joined || undefined;
}

export function serializeAccount(doc: IManagerAccount): ManagerAccount {
  return {
    id: String(doc._id),
    clientName: doc.clientName,
    companyName: doc.companyName || undefined,
    contactEmail: doc.contactEmail,
    contactPhone: doc.contactPhone || undefined,
    managerUserId: doc.managerUserId ? String(doc.managerUserId) : undefined,
    managerName: populatedName(doc.managerUserId) ?? doc.clientName,
    planId: doc.planId,
    status: doc.status,
    amount: doc.amount,
    billingCycle: doc.billingCycle,
    startedAt: doc.startedAt.toISOString(),
    renewsAt: doc.renewsAt ? doc.renewsAt.toISOString() : undefined,
    lastPaymentAt: doc.lastPaymentAt
      ? doc.lastPaymentAt.toISOString()
      : undefined,
    paymentMethod: doc.paymentMethod,
    notes: doc.notes || undefined,
    stripeCustomerId: doc.stripeCustomerId || undefined,
    stripeSubscriptionId: doc.stripeSubscriptionId || undefined,
    stripePriceId: doc.stripePriceId || undefined,
    cancelAtPeriodEnd: doc.cancelAtPeriodEnd || undefined,
  };
}

export function serializePayment(doc: IManagerPayment): ManagerPayment {
  return {
    id: String(doc._id),
    accountId: String(doc.accountId),
    clientName: doc.clientName,
    companyName: doc.companyName || undefined,
    planId: doc.planId,
    amount: doc.amount,
    receivedOn: doc.receivedOn.toISOString(),
    method: doc.method,
    recordedBy: doc.recordedBy,
    periodLabel: doc.periodLabel || undefined,
    notes: doc.notes || undefined,
    stripeInvoiceId: doc.stripeInvoiceId || undefined,
  };
}
