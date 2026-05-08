import mongoose, { Schema, Model, Document } from "mongoose";

// ────────────────────────────────────────────────
//              Enums & Types
// ────────────────────────────────────────────────
export enum ComplianceStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  PENDING_RENEWAL = "pending_renewal",
  PENDING_ISSUANCE = "pending_issuance",
  REVOKED = "revoked",
  DRAFT = "draft",
}

export enum ComplianceType {
  FIRE_SAFETY = "fire_safety",
  OCCUPANCY_CERTIFICATE = "occupancy_certificate",
  BUILDING_PERMIT = "building_permit",
  TRADE_LICENSE = "trade_license",
  ELEVATOR_CERTIFICATE = "elevator_certificate",
  ELECTRICAL_SAFETY = "electrical_safety",
  ENVIRONMENTAL_CLEARANCE = "environmental_clearance",
  INSURANCE = "insurance",
  LIFT_LICENSE = "lift_license",
  HEALTH_LICENSE = "health_license",
  OTHER = "other",
}

// You can extend this later with more specific sub-types or categories

// ────────────────────────────────────────────────
//              Compliance Document Item
// ────────────────────────────────────────────────
export interface IComplianceDocument {
  fileUrl: string;           // or cloud storage key / path
  fileName: string;
  mimeType?: string;
  uploadedAt: Date;
  uploadedBy?: mongoose.Types.ObjectId; // ref: "User"
  notes?: string;
}

const ComplianceDocumentSchema = new Schema<IComplianceDocument>(
  {
    fileUrl: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    notes: String,
  },
  { _id: false }
);

// ────────────────────────────────────────────────
//              Main Compliance Schema
// ────────────────────────────────────────────────
export interface ICompliance extends Document {
  propertyId: mongoose.Types.ObjectId;
  // propertyName & address & type → better to populate from Property instead of duplicating
  // But if you really want denormalized copies for quick search / reporting:
  propertyName?: string;
  propertyType?: string;     // e.g. "residential", "commercial", "mixed-use"
  address?: string;          // full formatted address or structured object

  complianceType: ComplianceType;
  title: string;             // e.g. "Fire NOC 2025–2028", "All-Risk Insurance Policy"
  issuingAuthority?: string; // e.g. "Civil Defence", "Municipal Corporation", "Insurance Co."
  certificateNumber?: string;

  issueDate: Date;
  expiryDate: Date;

  status: ComplianceStatus;

  // Optional rich fields (very useful in real systems)
  renewalReminderDaysBefore?: number[]; // e.g. [30, 15, 7]
  notes?: string;
  customFields?: Record<string, any>;   // flexible key-value for type-specific data

  documents: IComplianceDocument[];

  deletedAt?: Date | null;

  // Auto-managed by timestamps: true
  createdAt: Date;
  updatedAt: Date;
}

const ComplianceSchema = new Schema<ICompliance>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },

    // Optional denormalized fields (faster listing / reporting, but need sync logic)
    propertyName: { type: String, trim: true },
    propertyType: { type: String, trim: true },
    address: { type: String, trim: true },

    complianceType: {
      type: String,
      enum: Object.values(ComplianceType),
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    issuingAuthority: {
      type: String,
      trim: true,
    },

    certificateNumber: {
      type: String,
      trim: true,
      sparse: true, // allows null + unique index if needed later
    },

    issueDate: {
      type: Date,
      required: true,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(ComplianceStatus),
      default: ComplianceStatus.DRAFT,
      required: true,
      index: true,
    },

    renewalReminderDaysBefore: {
      type: [Number],
      default: [30, 15, 7],
    },

    notes: String,

    customFields: { type: Schema.Types.Mixed, default: {} },

    documents: {
      type: [ComplianceDocumentSchema],
      default: [],
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true, // for soft-delete queries
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Virtuals ───────────────────────────────────────
ComplianceSchema.virtual("isExpired").get(function () {
  return this.expiryDate < new Date();
});

ComplianceSchema.virtual("daysUntilExpiry").get(function () {
  if (!this.expiryDate) return null;
  const diffMs = this.expiryDate.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
});

// ─── Indexes ────────────────────────────────────────
ComplianceSchema.index({ propertyId: 1, complianceType: 1 });
ComplianceSchema.index({ status: 1, expiryDate: 1 });
ComplianceSchema.index({ expiryDate: 1 }); // good for cron jobs scanning soon-to-expire items
ComplianceSchema.index({ "documents.fileUrl": 1 }); // if you ever need to find/delete orphans

// ─── Pre-save / business rules ──────────────────────
ComplianceSchema.pre("save", function (next) {
  // Auto-update status based on expiry
  if (this.expiryDate && this.expiryDate < new Date()) {
    this.status = ComplianceStatus.EXPIRED;
  } else if (this.status === ComplianceStatus.EXPIRED) {
    // reset only if manually corrected or renewed
    this.status = ComplianceStatus.ACTIVE;
  }

  // Optional: require expiry > issue
  if (this.issueDate && this.expiryDate && this.expiryDate <= this.issueDate) {
    return next(new Error("Expiry date must be after issue date"));
  }

  next();
});

const Compliance: Model<ICompliance> =
  mongoose.models?.Compliance || mongoose.model<ICompliance>("Compliance", ComplianceSchema);

export default Compliance;