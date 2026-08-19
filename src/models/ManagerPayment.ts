/**
 * PropertyPro - ManagerPayment model
 *
 * One payment received from a client against a ManagerAccount. Two ways a row
 * gets here:
 *
 *   cash — the admin records it after the fact, so `recordedBy` is the only
 *          trace of who took the money.
 *   card — the Stripe webhook writes it on invoice.paid, where `recordedBy` is
 *          "Stripe" and `stripeInvoiceId` is the authoritative trace.
 *
 * Client name and plan are denormalised so the ledger reads without a join, and
 * so a historic row still says what was true when the money arrived even if the
 * account is later renamed or moved to another plan.
 */

import mongoose, { Schema, Document, Model } from "mongoose";
import type { ManagerPaymentMethod } from "@/types/billing";

export interface IManagerPayment extends Document {
  accountId: mongoose.Types.ObjectId;
  clientName: string;
  companyName?: string;
  planId: string;
  /** GBP, major units. */
  amount: number;
  receivedOn: Date;
  method: ManagerPaymentMethod;
  recordedBy: string;
  /** The cycle this payment covered, for reconciling against renewals. */
  periodLabel?: string;
  notes?: string;
  stripeInvoiceId?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ManagerPaymentSchema = new Schema<IManagerPayment>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "ManagerAccount",
      required: [true, "Account is required"],
    },
    clientName: { type: String, required: true, trim: true, maxlength: 200 },
    companyName: { type: String, trim: true, maxlength: 200 },
    planId: { type: String, required: true, trim: true },
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
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The ledger is always read newest-first, usually scoped to one account.
ManagerPaymentSchema.index({ receivedOn: -1 });
ManagerPaymentSchema.index({ accountId: 1, receivedOn: -1 });
// Stripe retries webhook deliveries, so the same invoice can arrive twice.
// Unique-sparse makes the second write collide instead of double-counting
// revenue, which the analytics page would then report as real growth.
ManagerPaymentSchema.index(
  { stripeInvoiceId: 1 },
  { unique: true, sparse: true }
);

// Same escapable soft-delete filter as ManagerAccount: a query naming
// `deletedAt` opts out. Note it does NOT run for countDocuments()/aggregate().
ManagerPaymentSchema.pre(/^find/, function (this: any) {
  const conditions = this.getQuery();
  if (!("deletedAt" in conditions)) {
    this.where({ deletedAt: null });
  }
});

let ManagerPayment: Model<IManagerPayment>;

try {
  ManagerPayment = mongoose.model<IManagerPayment>("ManagerPayment");
} catch {
  ManagerPayment = mongoose.model<IManagerPayment>(
    "ManagerPayment",
    ManagerPaymentSchema
  );
}

export default ManagerPayment;
