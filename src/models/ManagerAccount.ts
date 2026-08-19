/**
 * PropertyPro - ManagerAccount model
 *
 * One document per manager account the admin has sold. A client pays the admin
 * to be given a Manager login; this record is what was agreed and what has been
 * received. The admin is the vendor, so money flows in — there is no bill the
 * org owes and therefore no subscription document on the org itself.
 *
 * Payment is either cash recorded by the admin after the fact, or a Stripe
 * subscription the client pays directly — hence the optional Stripe ids below.
 * A cash account simply never has them set.
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import { DEFAULT_PLAN_ID } from "@/lib/billing/plans";
import type {
  ManagerAccountStatus,
  ManagerPaymentMethod,
} from "@/types/billing";

export interface IManagerAccount extends Document {
  clientName: string;
  /** Trading name being billed, when it differs from the person. */
  companyName?: string;
  contactEmail: string;
  contactPhone?: string;
  /** The provisioned Manager user, once created. Absent while `pending`. */
  managerUserId?: mongoose.Types.ObjectId;
  planId: string;
  status: ManagerAccountStatus;
  /** What this client pays per cycle, in GBP. */
  amount: number;
  billingCycle: "monthly" | "annual";
  startedAt: Date;
  renewsAt?: Date | null;
  lastPaymentAt?: Date | null;
  paymentMethod: ManagerPaymentMethod;
  notes?: string;
  /** Set only for Stripe-billed accounts; absent on cash accounts. */
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** Soft delete, matching the convention used across the other models. */
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ManagerAccountSchema = new Schema<IManagerAccount>(
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
    managerUserId: { type: Schema.Types.ObjectId, ref: "User" },
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
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ManagerAccountSchema.index({ status: 1, deletedAt: 1 });
ManagerAccountSchema.index({ renewsAt: 1 });
ManagerAccountSchema.index({ managerUserId: 1 }, { sparse: true });
// The webhook looks accounts up by subscription id on every lifecycle event,
// and Stripe may retry, so this must be fast. Unique to make a double-delivery
// collide rather than quietly create a second account for the same subscription.
ManagerAccountSchema.index(
  { stripeSubscriptionId: 1 },
  { unique: true, sparse: true }
);
ManagerAccountSchema.index({ stripeCustomerId: 1 }, { sparse: true });

// Escapable soft-delete filter: a query naming `deletedAt` opts out, which is
// how a history or restore view reaches these rows. Matches the pattern used by
// Lease and Invoice. Note it does NOT run for countDocuments() or aggregate().
ManagerAccountSchema.pre(/^find/, function (this: any) {
  const conditions = this.getQuery();
  if (!("deletedAt" in conditions)) {
    this.where({ deletedAt: null });
  }
});

let ManagerAccount: Model<IManagerAccount>;

try {
  ManagerAccount = mongoose.model<IManagerAccount>("ManagerAccount");
} catch {
  ManagerAccount = mongoose.model<IManagerAccount>(
    "ManagerAccount",
    ManagerAccountSchema
  );
}

export default ManagerAccount;
