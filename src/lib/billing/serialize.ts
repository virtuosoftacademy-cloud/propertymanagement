/**
 * PropertyPro - Mongoose → DTO mapping for subscriptions
 *
 * The API returns the shapes in src/types/billing.ts, not raw documents: ids
 * become strings, dates become ISO strings, and nothing internal (deletedAt,
 * __v) leaks to the client. Kept in one place so a field added to the model has
 * a single obvious spot to be exposed from.
 */

import type { ISubscription, ISubscriptionPayment } from "@/models/Subscription";
import type { Subscription, SubscriptionPayment } from "@/types/billing";

/** A populated `userId`, when the query asked for one. */
type MaybePopulatedUser =
  | { _id: unknown; firstName?: string; lastName?: string; name?: string }
  | unknown;

/**
 * The id of a possibly-populated ref.
 *
 * These queries use .populate().lean(), which replaces the ObjectId with a
 * PLAIN OBJECT — so String(doc.userId) yielded the literal "[object Object]".
 * That string reached the edit form as the selected client, matched no option
 * in the picker, and the field rendered blank.
 */
function refId(value: MaybePopulatedUser): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  const v = value as { _id?: unknown };
  if (v._id != null) return String(v._id);
  const s = String(value);
  return s === "[object Object]" ? undefined : s;
}

function populatedName(value: MaybePopulatedUser): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const u = value as { firstName?: string; lastName?: string; name?: string };
  if (u.name) return u.name;
  const joined = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return joined || undefined;
}

export function serializeSubscription(doc: ISubscription): Subscription {
  return {
    id: String(doc._id),
    clientName: doc.clientName,
    companyName: doc.companyName || undefined,
    contactEmail: doc.contactEmail,
    contactPhone: doc.contactPhone || undefined,
    userId: refId(doc.userId),
    userName: populatedName(doc.userId) ?? doc.clientName,
    planId: doc.planId,
    status: doc.status,
    amount: doc.amount,
    billingCycle: doc.billingCycle,
    startedAt: new Date(doc.startedAt).toISOString(),
    renewsAt: doc.renewsAt ? new Date(doc.renewsAt).toISOString() : undefined,
    lastPaymentAt: doc.lastPaymentAt
      ? new Date(doc.lastPaymentAt).toISOString()
      : undefined,
    paymentMethod: doc.paymentMethod,
    notes: doc.notes || undefined,
    stripeCustomerId: doc.stripeCustomerId || undefined,
    stripeSubscriptionId: doc.stripeSubscriptionId || undefined,
    stripePriceId: doc.stripePriceId || undefined,
    cancelAtPeriodEnd: doc.cancelAtPeriodEnd || undefined,
  };
}

/**
 * One embedded payment, flattened for a ledger view.
 *
 * Client name and plan are copied from the parent rather than stored per
 * payment: embedded rows cannot be orphaned, so there is nothing to denormalise
 * against — the parent IS the record of who paid and for what.
 */
export function serializePayment(
  doc: ISubscriptionPayment,
  parent: ISubscription
): SubscriptionPayment {
  return {
    id: String(doc._id ?? ""),
    subscriptionId: String(parent._id),
    clientName: parent.clientName,
    companyName: parent.companyName || undefined,
    planId: parent.planId,
    amount: doc.amount,
    receivedOn: new Date(doc.receivedOn).toISOString(),
    method: doc.method,
    recordedBy: doc.recordedBy,
    periodLabel: doc.periodLabel || undefined,
    notes: doc.notes || undefined,
    stripeInvoiceId: doc.stripeInvoiceId || undefined,
  };
}

/** Every payment across a set of subscriptions, newest first. */
export function flattenPayments(
  docs: ISubscription[]
): SubscriptionPayment[] {
  return docs
    .flatMap((sub) => (sub.payments ?? []).map((p) => serializePayment(p, sub)))
    .sort(
      (a, b) =>
        new Date(b.receivedOn).getTime() - new Date(a.receivedOn).getTime()
    );
}
