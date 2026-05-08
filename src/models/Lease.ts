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
    rentBasis: {
      type: String,
      enum: ["monthly", "nightly"],
      default: "monthly",
      required: true,
    },

    // Used when rentBasis = monthly
    rentAmount: {
      type: Number,
      min: 0,
      default: 0,
      // required only conditionally — see pre-save hook
    },

    // Used when rentBasis = nightly
    nightlyRate: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Mainly relevant for nightly leases
    billingCycle: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "monthly",
    },

    securityDeposit: {
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
  }
);

// ─── Indexes ────────────────────────────────────────
LeaseSchema.index({ propertyId: 1, unitId: 1 });
LeaseSchema.index({ tenantId: 1, status: 1 });
LeaseSchema.index({ status: 1, endDate: 1 });
LeaseSchema.index({ "terms.rentBasis": 1 });
LeaseSchema.index({ deletedAt: 1 });

// ─── Virtuals ───────────────────────────────────────
LeaseSchema.virtual("durationDays").get(function () {
  if (! (this as any).startDate || ! (this as any).endDate) return null;
  return Math.ceil(( (this as any).endDate.getTime() - (this as any).startDate.getTime() ) / 86400000);
});

LeaseSchema.virtual("isNightly").get(function () {
  return (this as any).terms?.rentBasis === "nightly";
});

LeaseSchema.virtual("effectiveRent").get(function () {
  const t = (this as any).terms;
  if (!t) return 0;
  return t.rentBasis === "nightly" ? t.nightlyRate || 0 : t.rentAmount || 0;
});

// ─── Pre-save validation ─────────────────────────────
LeaseSchema.pre("save", async function (next) {
  // 1. Conditional required fields
  const isNightly = (this as any).terms?.rentBasis === "nightly";

  if (isNightly) {
    if (!(this as any).terms.nightlyRate || (this as any).terms.nightlyRate <= 0) {
      return next(new Error("Nightly rate must be greater than zero when rent basis is nightly"));
    }
    // Set default billingCycle for nightly leases if not provided
    if (!(this as any).terms.billingCycle) {
      (this as any).terms.billingCycle = "daily";
    }
  } else {
    if (!(this as any).terms.rentAmount || (this as any).terms.rentAmount <= 0) {
      return next(new Error("Monthly rent amount must be greater than zero when rent basis is monthly"));
    }
  }

  // 2. End date after start date
  if ((this as any).endDate <= (this as any).startDate) {
    return next(new Error("End date must be after start date"));
  }

  // 3. Basic unit-in-property validation (you can keep or enhance existing logic)
  next();
});

// You can keep soft-delete middleware, post-save unit status update, etc.
// (omitted here for brevity — add them back if needed)

const Lease: Model<ILease> = mongoose.models?.Lease || mongoose.model<ILease>("Lease", LeaseSchema);

export default Lease;