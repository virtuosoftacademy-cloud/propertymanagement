import mongoose, { Schema, Model } from "mongoose";
export interface IRole extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  label: string;
  description: string;
  permissions: string[];
  /**
   * The built-in role this custom role behaves as for route authorisation.
   *
   * Every API guard is written as withRoleAndDB([ADMIN, MANAGER, ...]) against
   * the three-value UserRole enum. Without this, a user holding a custom role
   * matches none of them and is refused everywhere — which is exactly why
   * "agent" and "manual_manager" could be created and assigned but never used.
   */
  inheritsFrom: "admin" | "manager" | "tenant";
  isSystem: boolean;
  isActive: boolean;
  /**
   * Narrowed to match the schema's own enum below. It was declared as `string`,
   * so assigning it to IRoleConfig.color (the same union) failed in every roles
   * route — four TS2322 errors that only stayed quiet because
   * next.config.ts sets typescript.ignoreBuildErrors.
   */
  color: "default" | "destructive" | "outline" | "secondary";

  // ── Plan fields ───────────────────────────────────────────────────────────
  //
  // A subscription plan IS a role: registration sets a user's role to the plan
  // id, and the Stripe webhook promotes them to it on payment. Keeping the
  // pricing on the role means the permissions a plan grants and the price it
  // charges are defined in one place and cannot drift apart — previously a plan
  // could exist with no matching role, and sign-up failed with "Sign-up is not
  // available yet" and no way to see why.
  //
  // Roles that are not plans (agent, maintenance_staff) simply leave isPlan
  // false and carry none of this.
  /** Whether this role is sold as a subscription plan. */
  isPlan: boolean;
  /** GBP, major units. null = negotiated per client. */
  monthlyPrice: number | null;
  annualPrice: number | null;
  /** How many units the holder may operate. null = unlimited. */
  unitLimit: number | null;
  /** Optional per-unit charge on top of the flat price, GBP/unit/month. */
  pricePerUnit: number | null;
  /** Bullet points shown on the pricing card. */
  features: string[];
  /** Highlighted on the pricing grid. */
  popular: boolean;
  /** Priced per client rather than off the shelf; no Stripe Price. */
  custom: boolean;
  /** Set when the plan is sold through Stripe Checkout. */
  stripeProductId: string | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;

  userCount: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;

  /**
   * Declared because RoleSchema.methods.softDelete exists but was never on the
   * interface, so calling it from the roles route was a TS2339 error.
   */
  softDelete(deletedBy: mongoose.Types.ObjectId): Promise<IRole>;
}

// Available system permissions
export const SYSTEM_PERMISSIONS = [
  // User Management
  "user_management",
  "user_view",
  "role_management",

  // Property Management
  "property_management",
  "property_view",
  /**
   * Lifts the per-property visibility scope.
   *
   * Without it a user sees only properties they created or were assigned
   * (see src/lib/auth/property-scope.ts). Granting it makes a custom role
   * behave like an admin for property visibility — which is why the scope is
   * driven by this permission rather than a hardcoded role check: an
   * admin-created role can opt in from the Roles UI without a code change.
   */
  "property_view_all",
  "property_create",
  "property_edit",
  "property_delete",

  // Tenant Management
  "tenant_management",
  "tenant_view",
  "tenant_create",
  "tenant_edit",

  // Lease Management
  "lease_management",
  "lease_view",
  "lease_create",
  "lease_edit",

  // Maintenance Management
  "maintenance_management",
  "maintenance_view",
  "maintenance_create",
  "maintenance_assign",
  "maintenance_requests",
  "work_orders",
  "maintenance_history",

  // Compliance Management
  // Mirrors the property/tenant/lease naming so the roles UI groups them the
  // same way. Backs the ComplianceReport surface: /api/compliance,
  // /api/compliance/[id] (+ renew, revoke), /active and /stats.
  "compliance_management",
  "compliance_view",
  "compliance_create",
  "compliance_edit",
  "compliance_delete",

  // Financial Management
  "financial_management",
  "financial_reports",
  "payment_processing",
  "payment_portal",
  "payment_history",

  // System Administration
  "system_settings",
  "audit_logs",
  "backup_restore",
  "bulk_operations",
  "company_settings",
  "data_export",

  // Reports and Analytics
  "reports_all",
  "reports_property",
  "reports_own",
  "advanced_analytics",

  // Applications and Screening
  "application_processing",
  "screening_management",

  // Document Management
  "document_access",
  "document_management",

  // Profile Management
  "profile_management",
] as const;

export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number];

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      trim: true,
      lowercase: true,
      match: [
        /^[a-z0-9_]+$/,
        "Role name can only contain lowercase letters, numbers, and underscores",
      ],
      maxlength: [50, "Role name cannot exceed 50 characters"],
    },
    label: {
      type: String,
      required: [true, "Role label is required"],
      trim: true,
      maxlength: [100, "Role label cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Role description is required"],
      trim: true,
      maxlength: [500, "Role description cannot exceed 500 characters"],
    },
    permissions: {
      type: [String],
      required: [true, "At least one permission is required"],
      validate: {
        validator: function (permissions: string[]) {
          // Validate that all permissions are valid system permissions
          return permissions.every((permission) =>
            SYSTEM_PERMISSIONS.includes(permission as SystemPermission)
          );
        },
        message: "Invalid permission specified",
      },
    },
    inheritsFrom: {
      type: String,
      enum: {
        values: ["admin", "manager", "tenant"],
        message: "Base role must be admin, manager or tenant",
      },
      // Tenant is the safe default: a role created without an explicit base
      // gets the least access rather than the most.
      default: "tenant",
      required: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
      immutable: true, // System roles cannot be changed after creation
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      enum: ["default", "destructive", "outline", "secondary"],
      default: "outline",
    },

    // Plan fields — see the interface above for why these live on the role.
    isPlan: { type: Boolean, default: false, index: true },
    monthlyPrice: { type: Number, default: null, min: 0 },
    annualPrice: { type: Number, default: null, min: 0 },
    unitLimit: { type: Number, default: null, min: 0 },
    pricePerUnit: { type: Number, default: null, min: 0 },
    features: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    custom: { type: Boolean, default: false },
    stripeProductId: { type: String, default: null, trim: true },
    stripePriceIdMonthly: { type: String, default: null, trim: true },
    stripePriceIdAnnual: { type: String, default: null, trim: true },
    userCount: {
      type: Number,
      default: 0,
      min: [0, "User count cannot be negative"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user is required"],
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "roles",
    toJSON: {
      virtuals: true,
      transform: function (doc, ret: Record<string, any>) {
        // `ret` is typed with __v required, so deleting it needs a widened
        // type rather than a non-null field.
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// ============================================================================
// INDEXES
// ============================================================================

// Partial unique index on name - only enforced for non-deleted roles
RoleSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
RoleSchema.index({ isSystem: 1 });
RoleSchema.index({ isActive: 1 });
RoleSchema.index({ createdBy: 1 });
RoleSchema.index({ deletedAt: 1 });

// Compound index for active, non-deleted roles
RoleSchema.index({ isActive: 1, deletedAt: 1 });

// ============================================================================
// VIRTUALS
// ============================================================================

RoleSchema.virtual("canEdit").get(function () {
  return !this.isSystem;
});

RoleSchema.virtual("canDelete").get(function () {
  return !this.isSystem && this.userCount === 0;
});

// ============================================================================
// METHODS
// ============================================================================

RoleSchema.methods.hasPermission = function (permission: string): boolean {
  return this.permissions.includes(permission);
};

RoleSchema.methods.addPermission = function (permission: string): void {
  if (
    !this.permissions.includes(permission) &&
    SYSTEM_PERMISSIONS.includes(permission as SystemPermission)
  ) {
    this.permissions.push(permission);
  }
};

RoleSchema.methods.removePermission = function (permission: string): void {
  this.permissions = this.permissions.filter((p: string) => p !== permission);
};

RoleSchema.methods.softDelete = function (
  deletedBy: mongoose.Types.ObjectId
): Promise<IRole> {
  this.deletedAt = new Date();
  this.updatedBy = deletedBy;
  this.isActive = false;
  return this.save();
};

// ============================================================================
// STATIC METHODS
// ============================================================================

RoleSchema.statics.findActive = function () {
  return this.find({ isActive: true, deletedAt: null });
};

RoleSchema.statics.findByPermission = function (permission: string) {
  return this.find({
    permissions: permission,
    isActive: true,
    deletedAt: null,
  });
};

RoleSchema.statics.getSystemRoles = function () {
  return this.find({ isSystem: true, isActive: true, deletedAt: null });
};

RoleSchema.statics.getCustomRoles = function () {
  return this.find({ isSystem: false, isActive: true, deletedAt: null });
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Pre-save middleware to validate permissions
RoleSchema.pre("save", function (next) {
  // Ensure permissions array is unique
  this.permissions = [...new Set(this.permissions)];

  // Validate permissions
  const invalidPermissions = this.permissions.filter(
    (permission) => !SYSTEM_PERMISSIONS.includes(permission as SystemPermission)
  );

  if (invalidPermissions.length > 0) {
    return next(
      new Error(`Invalid permissions: ${invalidPermissions.join(", ")}`)
    );
  }

  next();
});

// Pre-remove middleware to check if role can be deleted
RoleSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    if (this.isSystem) {
      return next(new Error("System roles cannot be deleted"));
    }

    if (this.userCount > 0) {
      return next(new Error("Cannot delete role with assigned users"));
    }

    next();
  }
);

// ============================================================================
// MODEL CREATION
// ============================================================================

let Role: Model<IRole>;

try {
  Role = mongoose.model<IRole>("Role");
} catch (error) {
  Role = mongoose.model<IRole>("Role", RoleSchema);
}

export default Role;
