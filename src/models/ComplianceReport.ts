import mongoose, { Schema } from "mongoose";
import {
  IComplianceReport,
  IComplianceReportModel,
  ComplianceCategory,
  ComplianceStatus,
} from "@/types";

const ComplianceDocumentSchema = new Schema(
  {
    url: { type: String, required: [true, "Document URL is required"], trim: true },
    name: { type: String, trim: true },
    size: { type: Number, min: 0 },
    mimeType: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ComplianceReportSchema = new Schema<IComplianceReport>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: [true, "Property ID is required"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    category: {
      type: String,
      enum: Object.values(ComplianceCategory),
      required: [true, "Category is required"],
    },
    issueDate: {
      type: Date,
      required: [true, "Issue date is required"],
      validate: {
        validator: function (date: Date) {
          if (!date) return false;
          // Issue date cannot be in the future (mirrors form's date picker constraint)
          return date <= new Date();
        },
        message: "Issue date cannot be in the future",
      },
    },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
      validate: {
        validator: function (this: IComplianceReport, date: Date) {
          if (!date || !this.issueDate) return false;
          return date > this.issueDate;
        },
        message: "Expiry date must be after issue date",
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
    estimatedCost: {
      type: Number,
      min: [0, "Estimated cost cannot be negative"],
      max: [1000000, "Estimated cost cannot exceed $1,000,000"],
    },
    documents: {
      type: [ComplianceDocumentSchema],
      default: [],
      validate: {
        validator: function (docs: any[]) {
          return docs.length <= 20;
        },
        message: "Cannot have more than 20 documents",
      },
    },
    status: {
      type: String,
      enum: Object.values(ComplianceStatus),
      default: ComplianceStatus.ACTIVE,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ──────────────── Indexes ────────────────
ComplianceReportSchema.index({ propertyId: 1 });
ComplianceReportSchema.index({ createdBy: 1 });
ComplianceReportSchema.index({ category: 1 });
ComplianceReportSchema.index({ status: 1 });
ComplianceReportSchema.index({ expiryDate: 1 });
ComplianceReportSchema.index({ deletedAt: 1 });
ComplianceReportSchema.index({ createdAt: -1 });

// Compound indexes for common queries
ComplianceReportSchema.index({ propertyId: 1, category: 1 });
ComplianceReportSchema.index({ propertyId: 1, status: 1 });
ComplianceReportSchema.index({ status: 1, expiryDate: 1 });

// ──────────────── Virtuals ────────────────
ComplianceReportSchema.virtual("daysUntilExpiry").get(function () {
  if (!this.expiryDate) return null;
  const diff = this.expiryDate.getTime() - Date.now();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
});

ComplianceReportSchema.virtual("validityDuration").get(function () {
  if (!this.issueDate || !this.expiryDate) return null;
  const diff = this.expiryDate.getTime() - this.issueDate.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
});

ComplianceReportSchema.virtual("isExpired").get(function () {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

ComplianceReportSchema.virtual("isExpiringSoon").get(function () {
  if (!this.expiryDate) return false;
  if (this.status === ComplianceStatus.REVOKED) return false;
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const expiry = this.expiryDate.getTime();
  return expiry > now && expiry - now <= thirtyDays;
});

// ──────────────── Statics ────────────────
ComplianceReportSchema.statics.findByProperty = function (propertyId: string) {
  return this.find({ propertyId, deletedAt: null });
};

ComplianceReportSchema.statics.findByCategory = function (
  category: ComplianceCategory
) {
  return this.find({ category, deletedAt: null });
};

ComplianceReportSchema.statics.findExpired = function () {
  return this.find({
    expiryDate: { $lt: new Date() },
    status: { $ne: ComplianceStatus.REVOKED },
    deletedAt: null,
  });
};

ComplianceReportSchema.statics.findExpiringSoon = function (days: number = 30) {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return this.find({
    expiryDate: { $gte: now, $lte: future },
    status: { $nin: [ComplianceStatus.EXPIRED, ComplianceStatus.REVOKED] },
    deletedAt: null,
  });
};

// ──────────────── Instance methods ────────────────
ComplianceReportSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  return this.save();
};

ComplianceReportSchema.methods.restore = function () {
  this.deletedAt = null;
  return this.save();
};

ComplianceReportSchema.methods.revoke = function (reason?: string) {
  this.status = ComplianceStatus.REVOKED;
  if (reason) {
    this.notes = this.notes ? `${this.notes}\n\nRevoked: ${reason}` : `Revoked: ${reason}`;
  }
  return this.save();
};

ComplianceReportSchema.methods.renew = function (
  newIssueDate: Date,
  newExpiryDate: Date,
  notes?: string
) {
  this.issueDate = newIssueDate;
  this.expiryDate = newExpiryDate;
  this.status = ComplianceStatus.ACTIVE;
  if (notes) this.notes = notes;
  return this.save();
};

// ──────────────── Middleware ────────────────
// Exclude soft-deleted documents from any find query by default
ComplianceReportSchema.pre(/^find/, function (this: any) {
  const conditions = this.getQuery();
  if (!("deletedAt" in conditions) && !("includeDeleted" in conditions)) {
    this.where({ deletedAt: null });
  }
});

// Auto-derive status from dates and validate references
ComplianceReportSchema.pre("save", async function (next) {
  // Auto-update status based on expiry date (skip if revoked)
  if (this.expiryDate && this.status !== ComplianceStatus.REVOKED) {
    const now = Date.now();
    const expiry = this.expiryDate.getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (expiry < now) {
      this.status = ComplianceStatus.EXPIRED;
    } else if (expiry - now <= thirtyDays) {
      this.status = ComplianceStatus.EXPIRING_SOON;
    } else {
      this.status = ComplianceStatus.ACTIVE;
    }
  }

  // Validate property exists
  if (this.isModified("propertyId")) {
    const Property = mongoose.model("Property");
    const property = await Property.findById(this.propertyId);
    if (!property) return next(new Error("Property not found"));
  }

  // Validate creator exists
  if (this.isModified("createdBy") && this.createdBy) {
    const User = mongoose.model("User");
    const user = await User.findById(this.createdBy);
    if (!user) return next(new Error("Creator user not found"));
  }

  next();
});

// Ensure latest schema is used (helps with hot reload in dev)
if (mongoose.models.ComplianceReport) {
  delete mongoose.models.ComplianceReport;
}

const ComplianceReport = mongoose.model<
  IComplianceReport,
  IComplianceReportModel
>("ComplianceReport", ComplianceReportSchema);

export default ComplianceReport;