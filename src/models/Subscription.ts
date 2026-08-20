/**
 * PropertyPro - Subscription model
 *
 * One document per subscription sold. A customer is a row in `users` (the
 * login) plus a row here (what they pay for), joined by `userId`.
 *
 * Replaces the former ManagerAccount + ManagerPayment pair. Payments are now
 * EMBEDDED rather than a second collection: a subscription accrues roughly
 * twelve a year, so the array stays small, and the ledger can never be orphaned
 * from the subscription it explains.
 *
 * Money can arrive two ways:
 *   cash — recorded by an admin after the fact, so `recordedBy` is the only
 *          trace of who took it.
 *   card — written by the Stripe webhook on invoice.paid, where `recordedBy`
 *          is "Stripe" and `stripeInvoiceId` is the authoritative trace.
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { DEFAULT_PLAN_ID } from "@/lib/billing/plans";
import type {
  SubscriptionStatus,
  SubscriptionPaymentMethod,
} from "@/types/billing";

export interface ISubscriptionPayment {
  _id?: mongoose.Types.ObjectId;
  /** GBP, major units. */
  amount: number;
  receivedOn: Date;
  method: SubscriptionPaymentMethod;
  recordedBy: string;
  /** The cycle this payment covered, for reconciling against renewals. */
  periodLabel?: string;
  notes?: string;
  stripeInvoiceId?: string | null;
}

export interface ISubscription extends Document {
  clientName: string;
  /** Trading name being billed, when it differs from the person. */
  companyName?: string;
  contactEmail: string;
  contactPhone?: string;
  /** The users row this subscription belongs to. */
  userId?: mongoose.Types.ObjectId;
  planId: string;
  status: SubscriptionStatus;
  /** What this client pays per cycle, in GBP. */
  amount: number;
  billingCycle: "monthly" | "annual";
  startedAt: Date;
  renewsAt?: Date | null;
  lastPaymentAt?: Date | null;
  paymentMethod: SubscriptionPaymentMethod;
  notes?: string;
  /** Set only for Stripe-billed subscriptions; absent on cash ones. */
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  cancelAtPeriodEnd?: boolean;
  payments: ISubscriptionPayment[];
  /** Soft delete, matching the convention used across the other models. */
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<ISubscriptionPayment>(
  {
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    receivedOn: { type: Date, required: true, default: Date.now },
    method: {
      type: String,
      enum: ["cash", "card"],
      default: "cash",
      required: true,
    },
    recordedBy: { type: String, required: true, trim: true, maxlength: 200 },
    periodLabel: { type: String, trim: true, maxlength: 60 },
    notes: { type: String, trim: true, maxlength: [2000, "Notes are too long"] },
    stripeInvoiceId: { type: String, default: null, trim: true },
  },
  { _id: true, timestamps: false }
);

const SubscriptionSchema = new Schema<ISubscription>(
  {
    clientName: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
      maxlength: [200, "Client name cannot exceed 200 characters"],
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [200, "Company name cannot exceed 200 characters"],
    },
    contactEmail: {
      type: String,
      required: [true, "Contact email is required"],
      trim: true,
      lowercase: true,
    },
    contactPhone: { type: String, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    planId: { type: String, required: true, default: DEFAULT_PLAN_ID, trim: true },
    status: {
      type: String,
      enum: ["pending", "active", "past_due", "cancelled", "expired"],
      default: "pending",
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
      required: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    renewsAt: { type: Date, default: null },
    lastPaymentAt: { type: Date, default: null },
    paymentMethod: {
      // Only methods the app can actually process. Widen this enum rather than
      // storing a method that misrepresents how the money moved.
      type: String,
      enum: ["cash", "card"],
      default: "cash",
      required: true,
    },
    notes: { type: String, trim: true, maxlength: [2000, "Notes are too long"] },
    stripeCustomerId: { type: String, default: null, trim: true },
    stripeSubscriptionId: { type: String, default: null, trim: true },
    stripePriceId: { type: String, default: null, trim: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    payments: { type: [PaymentSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ status: 1, deletedAt: 1 });
SubscriptionSchema.index({ renewsAt: 1 });
SubscriptionSchema.index({ userId: 1 }, { sparse: true });
SubscriptionSchema.index({ stripeCustomerId: 1 }, { sparse: true });

// PARTIAL, not sparse. These fields carry `default: null`, so they are always
// PRESENT — and a sparse index only skips documents where the key is ABSENT.
// Under sparse, every cash subscription indexed null and the second one ever
// created collided, which broke registration for all but the first user.
SubscriptionSchema.index(
  { stripeSubscriptionId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripeSubscriptionId: { $type: "string" } },
  }
);

// Stripe retries deliveries, so the same invoice can arrive twice. This stops
// the same invoice landing on TWO subscriptions. It cannot stop a duplicate
// inside one document's array — Mongo permits repeated keys within a single
// document — so the webhook also pushes conditionally on the id being absent.
SubscriptionSchema.index(
  { "payments.stripeInvoiceId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "payments.stripeInvoiceId": { $type: "string" },
    },
  }
);

// Escapable soft-delete filter: a query naming `deletedAt` opts out, which is
// how a history or restore view reaches these rows. Matches the pattern used by
// Lease and Invoice. Note it does NOT run for countDocuments() or aggregate().
SubscriptionSchema.pre(/^find/, function (this: any) {
  const conditions = this.getQuery();
  if (!("deletedAt" in conditions)) {
    this.where({ deletedAt: null });
  }
});

let Subscription: Model<ISubscription>;

try {
  Subscription = mongoose.model<ISubscription>("Subscription");
} catch {
  Subscription = mongoose.model<ISubscription>(
    "Subscription",
    SubscriptionSchema
  );
}

export default Subscription;
