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

/**
 * @param userName resolved separately by the caller.
 *
 * Names are NOT populated. .populate() REPLACES the field, so when the
 * referenced user is missing or soft-deleted it becomes null and the raw id is
 * lost with it — which silently broke the link between a subscription and its
 * user, and blanked the client picker on the edit form. Reading the id straight
 * off the document means it survives regardless of the user's state.
 */
export function serializeSubscription(
  doc: ISubscription,
  userName?: string
): Subscription {
  return {
    id: String(doc._id),
    clientName: doc.clientName,
    companyName: doc.companyName || undefined,
    contactEmail: doc.contactEmail,
    contactPhone: doc.contactPhone || undefined,
    userId: refId(doc.userId),
    userName: userName ?? populatedName(doc.userId) ?? doc.clientName,
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

/**
 * Display names for a set of subscriptions, keyed by user id.
 *
 * Soft-deleted users are simply absent — the subscription still shows its own
 * clientName, and the id it links by is untouched.
 */
export async function resolveUserNames(
  docs: ISubscription[],
  User: any
): Promise<Map<string, string>> {
  const ids = docs.map((d) => refId(d.userId)).filter(Boolean) as string[];
  if (ids.length === 0) return new Map();

  const users: any[] = await User.find({ _id: { $in: ids } })
    .select("firstName lastName")
    .lean();

  return new Map(
    users.map((u) => [
      String(u._id),
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim(),
    ])
  );
}

/**
 * Subscriptions an admin should see, with their users' display names.
 *
 * Shared by the list and the analytics endpoints so the two cannot disagree
 * about who exists — a subscription hidden from one but counted by the other
 * would show a client that vanished from the table but still moved the
 * revenue figures.
 *
 * A subscription is hidden when it POINTS AT a deleted user. One with no
 * userId at all is kept: that is an account sold but not yet provisioned a
 * login, which is a real row someone still needs to act on.
 */
export async function loadVisibleSubscriptions(
  Subscription: any,
  User: any
): Promise<{
  docs: ISubscription[];
  names: Map<string, string>;
  hidden: number;
}> {
  const all: ISubscription[] = await Subscription.find({})
    .sort({ createdAt: -1 })
    .lean();

  // The User model's soft-delete hook means this map holds LIVE users only,
  // so it doubles as the liveness check.
  const names = await resolveUserNames(all, User);

  // .has(), not truthiness — a live user with a blank name maps to "".
  const docs = all.filter((d) => {
    const uid = d.userId ? String(d.userId) : "";
    return uid === "" || names.has(uid);
  });

  return { docs, names, hidden: all.length - docs.length };
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
