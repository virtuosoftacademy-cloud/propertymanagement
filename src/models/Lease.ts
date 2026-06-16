import mongoose, { Schema, Model } from "mongoose";
import {
  ILease,
  LeaseStatus,
  ILeaseTerms,
  ILeasePaymentConfig,
  ILateFeeConfig,
  PaymentMethod,
} from "@/types";

// ────────────────────────────────────────────────
//              Late Fee Configuration
// ────────────────────────────────────────────────
const LateFeeConfigSchema = new Schema<ILateFeeConfig>(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    gracePeriodDays: {
      type: Number,
      default: 5,
      min: 0,
      max: 45,
    },
    feeType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },
    feeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    compoundDaily: {
      type: Boolean,
      default: false,
    },
    notificationDays: {
      type: [Number],
      default: [3, 7, 14],
    },
  },
  { _id: false }
);

// ────────────────────────────────────────────────
//           Lease Payment Configuration
// ────────────────────────────────────────────────
const LeasePaymentConfigSchema = new Schema<ILeasePaymentConfig>(
  {
    rentDueDay: {
      type: Number,
      min: 1,
      max: 31,
      default: 1,
    },
    lateFeeConfig: {
      type: LateFeeConfigSchema,
      default: () => ({}),
    },
    acceptedPaymentMethods: {
      type: [String],
      enum: Object.values(PaymentMethod),
      default: [PaymentMethod.BANK_TRANSFER, PaymentMethod.CREDIT_CARD],
    },
    autoGenerateInvoices: {
      type: Boolean,
      default: true,
    },
    autoEmailInvoices: {
      type: Boolean,
      default: false,
    },
    autoCreatePayments: {
      type: Boolean,
      default: true,
    },
    prorationEnabled: {
      type: Boolean,
      default: true,
    },
    advancePaymentMonths: {
      type: Number,
      min: 0,
      max: 6,
      default: 0,
    },
  },
  { _id: false }
);

// ────────────────────────────────────────────────
//                  Lease Terms
// ────────────────────────────────────────────────
const LeaseTermsSchema = new Schema<ILeaseTerms>(
  {
    // Rent rate proposed by the landlord; used to compute the total
    // (rate x days between start and end).
    rentAmount: {
      type: Number,
      min: 0,
      default: 0,
      required: true,
    },

    // Auto-calculated landlord total (rentAmount x number of days). The form
    // submits this; the pre-save hook recomputes it as a safeguard.
    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ─── Agent-proposed rent (HMO properties with an assigned agent only) ───
    // The assigned agent is optional, so these are only populated when the
    // property is an HMO that has a managing agent. They are informational and
    // do not change the landlord total that drives the lease.

    // Rent rate proposed by the managing agent.
    rentProposedByAgent: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Auto-calculated agent total (rentProposedByAgent x number of days).
    // Recomputed in the pre-save hook as a safeguard.
    agentTotalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Difference between the totals (totalAmount - agentTotalAmount).
    // Positive => landlord proposes more; negative => agent proposes more.
    // No `min` because this value may legitimately be negative.
    rentTotalDifference: {
      type: Number,
      default: 0,
    },

    securityDeposit: {
      type: Number,
      min: 0,
      default: 0,
    },

    lateFee: {
      type: Number,
      min: 0,
      default: 0,
    },

    // kept for future extension (currently empty in form)
    utilities: {
      type: [String],
      default: [],
    },

    restrictions: {
      type: [String],
      default: [],
    },

    paymentConfig: {
      type: LeasePaymentConfigSchema,
      default: () => ({}),
    },
  },
  { _id: false }
);

const LeaseSchema = new Schema<ILease>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },

    unitId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(LeaseStatus),
      default: LeaseStatus.DRAFT,
      required: true,
    },

    terms: {
      type: LeaseTermsSchema,
      required: true,
    },

    // ─────── Optional / future fields ───────
    documents: { type: [String], default: [] },
    signedDate: { type: Date },
    signedBy: { type: Schema.Types.ObjectId, ref: "User" },
    signatureData: String,
    terminatedDate: Date,
    terminatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    terminationReason: String,
    notes: String,
    deletedAt: { type: Date, default: null },

    // If you later implement renewals
    renewedLeaseId: { type: Schema.Types.ObjectId, ref: "Lease" },
    parentLeaseId: { type: Schema.Types.ObjectId, ref: "Lease" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_, ret) => { delete ret.__v; return ret; } },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ────────────────────────────────────────
LeaseSchema.index({ propertyId: 1, unitId: 1 });
LeaseSchema.index({ tenantId: 1, status: 1 });
LeaseSchema.index({ status: 1, endDate: 1 });
LeaseSchema.index({ deletedAt: 1 });
// Supports availability / overlap lookups by unit and date range.
LeaseSchema.index({ propertyId: 1, unitId: 1, startDate: 1, endDate: 1 });

// ─── Virtuals ───────────────────────────────────────
LeaseSchema.virtual("durationDays").get(function () {
  if (!(this as any).startDate || !(this as any).endDate) return null;
  return Math.ceil(
    ((this as any).endDate.getTime() - (this as any).startDate.getTime()) / 86400000
  );
});

LeaseSchema.virtual("computedTotal").get(function () {
  const days = (this as any).durationDays || 0;
  const rate = (this as any).terms?.rentAmount || 0;
  return days * rate;
});

LeaseSchema.virtual("computedAgentTotal").get(function () {
  const days = (this as any).durationDays || 0;
  const rate = (this as any).terms?.rentProposedByAgent || 0;
  return days * rate;
});

// ─── Pre-save validation & normalization ─────────────
LeaseSchema.pre("save", async function (next) {
  const terms = (this as any).terms;
  if (!terms) return next(new Error("Lease terms are required"));

  if (!terms.rentAmount || terms.rentAmount <= 0) {
    return next(new Error("Rent amount must be greater than zero"));
  }

  // End date after start date
  if ((this as any).endDate <= (this as any).startDate) {
    return next(new Error("End date must be after start date"));
  }

  // Recompute the total from rate x days as a safeguard against a stale or
  // tampered client value.
  const days = Math.max(
    0,
    Math.round(
      ((this as any).endDate.getTime() - (this as any).startDate.getTime()) / 86_400_000
    )
  );
  terms.totalAmount = days * terms.rentAmount;

  // Recompute the agent figures the same way. These only apply to HMO
  // properties with an assigned agent; when no agent rent is proposed we clear
  // the derived values so nothing stale is persisted.
  if (typeof terms.rentProposedByAgent === "number" && terms.rentProposedByAgent > 0) {
    terms.agentTotalAmount = days * terms.rentProposedByAgent;
    terms.rentTotalDifference = terms.totalAmount - terms.agentTotalAmount;
  } else {
    terms.rentProposedByAgent = 0;
    terms.agentTotalAmount = 0;
    terms.rentTotalDifference = 0;
  }

  next();
});

// ─── Bulk-update validation ──────────────────────────
// Mongoose update operations (updateMany / updateOne / findOneAndUpdate) do NOT
// run document `pre("save")` middleware, so the rules above are bypassed by the
// bulk PUT route. This turns on the schema validators for those updates.
LeaseSchema.pre(["updateMany", "updateOne", "findOneAndUpdate"], function (next) {
  this.setOptions({ runValidators: true });
  next();
});

// You can keep soft-delete middleware, post-save unit status update, etc.
// (omitted here for brevity — add them back if needed)

const Lease: Model<ILease> =
  mongoose.models?.Lease || mongoose.model<ILease>("Lease", LeaseSchema);

export default Lease;