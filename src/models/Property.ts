import mongoose, { Schema, Model } from "mongoose";
import {
  IProperty,
  PropertyType,
  PropertyStatus,
  IAddress,
  IAmenity,
  PropertyownerType,
} from "@/types";

// Embedded Unit Schema for unified property-unit model
const EmbeddedUnitSchema = new Schema(
  {
    unitNumber: {
      type: String,
      required: [true, "Unit number is required"],
      trim: true,
      maxlength: [20, "Unit number cannot exceed 20 characters"],
    },
    unitType: {
      type: String,
      enum: ["apartment", "studio", "penthouse", "loft", "room"],
      required: [true, "Unit type is required"],
    },
    floor: {
      type: Number,
      min: [0, "Floor cannot be negative"],
      max: [200, "Floor cannot exceed 200"],
    },
    bedrooms: {
      type: Number,
      required: [true, "Number of bedrooms is required"],
      min: [0, "Bedrooms cannot be negative"],
      max: [20, "Bedrooms cannot exceed 20"],
    },
    bathrooms: {
      type: Number,
      required: [true, "Number of bathrooms is required"],
      min: [0, "Bathrooms cannot be negative"],
      max: [20, "Bathrooms cannot exceed 20"],
    },
    squareFootage: {
      type: Number,
      required: [true, "Square footage is required"],
      min: [50, "Square footage must be at least 50"],
      max: [50000, "Square footage cannot exceed 50,000"],
    },
    rentAmount: {
      type: Number,
      required: [true, "Rent amount is required"],
      min: [0, "Rent amount cannot be negative"],
      max: [100000, "Rent amount cannot exceed $100,000"],
    },
    securityDeposit: {
      type: Number,
      required: [true, "Security deposit is required"],
      min: [0, "Security deposit cannot be negative"],
      max: [50000, "Security deposit cannot exceed $50,000"],
    },
    status: {
      type: String,
      enum: Object.values(PropertyStatus),
      default: PropertyStatus.AVAILABLE,
      required: [true, "Unit status is required"],
    },
    balcony: { type: Boolean, default: false },
    patio: { type: Boolean, default: false },
    garden: { type: Boolean, default: false },
    dishwasher: { type: Boolean, default: false },
    inUnitLaundry: { type: Boolean, default: false },
    hardwoodFloors: { type: Boolean, default: false },
    fireplace: { type: Boolean, default: false },
    walkInClosets: { type: Boolean, default: false },
    centralAir: { type: Boolean, default: false },
    ceilingFans: { type: Boolean, default: false },
    appliances: {
      refrigerator: { type: Boolean, default: false },
      stove: { type: Boolean, default: false },
      oven: { type: Boolean, default: false },
      microwave: { type: Boolean, default: false },
      dishwasher: { type: Boolean, default: false },
      washer: { type: Boolean, default: false },
      dryer: { type: Boolean, default: false },
      washerDryerHookups: { type: Boolean, default: false },
    },
    parking: {
      included: { type: Boolean, default: false },
      spaces: { type: Number, min: [0, "Parking spaces cannot be negative"], max: [10, "Parking spaces cannot exceed 10"], default: 0 },
      type: { type: String, enum: ["garage", "covered", "open", "street"], default: "open" },
      gated: { type: Boolean, default: false },
      assigned: { type: Boolean, default: false },
    },
    utilities: {
      electricity: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      water: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      gas: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      internet: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      cable: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      heating: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      cooling: { type: String, enum: ["included", "tenant", "shared"], default: "tenant" },
      trash: { type: String, enum: ["included", "tenant", "shared"], default: "included" },
      sewer: { type: String, enum: ["included", "tenant", "shared"], default: "included" },
    },
    notes: { type: String, trim: true, maxlength: [1000, "Notes cannot exceed 1000 characters"] },
    images: {
      type: [String],
      default: [],
      validate: { validator: (images: string[]) => images.length <= 15, message: "Cannot have more than 15 images per unit" },
    },
    attachments: {
      type: [
        {
          fileName: { type: String, required: true, trim: true },
          fileUrl: { type: String, required: true, trim: true },
          fileSize: { type: Number, required: true, min: [0, "File size cannot be negative"] },
          fileType: { type: String, required: true, trim: true },
          uploadedAt: { type: Date, default: Date.now },
          uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
        },
      ],
      default: [],
      validate: { validator: (a: any[]) => a.length <= 20, message: "Cannot have more than 20 attachments" },
    },
    availableFrom: { type: Date },
    lastRenovated: { type: Date },
    currentTenantId: { type: Schema.Types.ObjectId, ref: "User" },
    currentLeaseId: { type: Schema.Types.ObjectId, ref: "Lease" },
  },
  {
    _id: true,
    timestamps: false,
  }
);

// Address subdocument schema
const AddressSchema = new Schema<IAddress>(
  {
    street: { type: String, required: [true, "Street address is required"], trim: true, maxlength: [200, "Street address cannot exceed 200 characters"] },
    city: { type: String, required: [true, "City is required"], trim: true, maxlength: [100, "City cannot exceed 100 characters"] },
    state: { type: String, required: [true, "State is required"], trim: true, maxlength: [50, "State cannot exceed 50 characters"] },
    zipCode: { type: String, required: [true, "ZIP/Postal code is required"], trim: true, maxlength: [20, "ZIP/Postal code cannot exceed 20 characters"] },
    country: { type: String, required: [true, "Country is required"], trim: true, default: "United Kingdom", maxlength: [100, "Country cannot exceed 100 characters"] },
  },
  { _id: false }
);

// Amenity subdocument schema
const AmenitySchema = new Schema<IAmenity>(
  {
    name: { type: String, required: [true, "Amenity name is required"], trim: true, maxlength: [100, "Amenity name cannot exceed 100 characters"] },
    description: { type: String, trim: true, maxlength: [500, "Amenity description cannot exceed 500 characters"] },
    category: {
      type: String,
      required: [true, "Amenity category is required"],
      trim: true,
      enum: ["Kitchen", "Bathroom", "Living", "Bedroom", "Outdoor", "Parking", "Security", "Utilities", "Recreation", "Laundry", "Climate", "Other"],
    },
  },
  { _id: false }
);

const PropertySchema = new Schema<IProperty>(
  {
    propertyOwnerName: {
      type: String,
      required: [true, "Property owner name is required"],
      trim: true,
      maxlength: [200, "Property owner name cannot exceed 200 characters"],
    },
    ownerType: {
      type: String,
      enum: Object.values(PropertyownerType),
      required: [true, "Owner type is required"],
    },
    name: {
      type: String,
      required: [true, "Property name is required"],
      trim: true,
      maxlength: [200, "Property name cannot exceed 200 characters"],
    },
    assignedAgentName: { type: String, default: null },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    type: {
      type: String,
      enum: Object.values(PropertyType),
      required: [true, "Property type is required"],
    },

    // ── CHANGE 1: status moved to top-level property schema ──────────────────
    // Previously status only existed at the unit level. The form no longer
    // collects it from the user (it was replaced by assignedAgent) but it is
    // still needed at the property level because:
    //   • calculatePropertyStatus() writes to this.status
    //   • updatePropertyStatusFromUnits() reads/writes this.status
    //   • findAvailable() / softDelete() / restore() all reference it
    // Default is AVAILABLE; it is auto-calculated from unit statuses on save.
    status: {
      type: String,
      enum: Object.values(PropertyStatus),
      default: PropertyStatus.AVAILABLE,
      required: [true, "Property status is required"],
    },
    address: {
      type: AddressSchema,
      required: [true, "Property address is required"],
    },
    yearBuilt: {
      type: Number,
      min: [1800, "Year built cannot be before 1800"],
      max: [new Date().getFullYear() + 5, "Year built cannot be more than 5 years in the future"],
    },
    amenities: {
      type: [AmenitySchema],
      default: [],
    },
    isMultiUnit: { type: Boolean, default: false },
    totalUnits: {
      type: Number,
      min: [1, "Total units must be at least 1"],
      max: [1000, "Total units cannot exceed 1000"],
      default: 1,
    },
    units: {
      type: [EmbeddedUnitSchema],
      default: [],
      validate: { validator: (units: any[]) => units.length <= 1000, message: "Cannot have more than 1000 units per property" },
    },
    attachments: {
      type: [
        {
          fileName: { type: String, required: true, trim: true },
          fileUrl: { type: String, required: true, trim: true },
          fileSize: { type: Number, required: true, min: [0, "File size cannot be negative"] },
          fileType: { type: String, required: true, trim: true },
          uploadedAt: { type: Date, default: Date.now },
          uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
        },
      ],
      default: [],
      validate: { validator: (a: any[]) => a.length <= 20, message: "Cannot have more than 20 attachments" },
    },
    images: {
      type: [String],
      default: [],
      validate: { validator: (images: string[]) => images.length <= 20, message: "Cannot have more than 20 images" },
    },
    assignedAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Property owner is required"],
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletedAt: { type: Date, default: null },
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

// Indexes
try {
  PropertySchema.index({ ownerId: 1 });
  PropertySchema.index({ managerId: 1 });
  PropertySchema.index({ status: 1 });
  PropertySchema.index({ type: 1 });
  PropertySchema.index({ "address.city": 1 });
  PropertySchema.index({ "address.state": 1 });
  PropertySchema.index({ "address.zipCode": 1 });
  PropertySchema.index({ deletedAt: 1 });
  PropertySchema.index({ createdAt: -1 });
  // CHANGE 3: index on assignedAgent for fast agent→property lookups
  PropertySchema.index({ assignedAgent: 1 });
  PropertySchema.index({ status: 1, type: 1 });
  PropertySchema.index({ ownerId: 1, status: 1 });
  PropertySchema.index({ managerId: 1, status: 1 });
  // CHANGE 4: compound index — find all HMO properties for a given agent
  PropertySchema.index({ assignedAgent: 1, type: 1 });
} catch {
  // Silently handle index creation errors
}

// Virtuals
PropertySchema.virtual("fullAddress").get(function () {
  const { street, city, state, zipCode } = this.address;
  return `${street}, ${city}, ${state} ${zipCode}`;
});

PropertySchema.virtual("rentPerSqFt").get(function () {
  const units = this.units || [];
  if (units.length === 0) return 0;
  const totalRent = units.reduce((sum: number, unit: any) => sum + (unit.rentAmount || 0), 0);
  const totalSqFt = units.reduce((sum: number, unit: any) => sum + (unit.squareFootage || 0), 0);
  return totalSqFt > 0 ? (totalRent / totalSqFt).toFixed(2) : 0;
});

PropertySchema.virtual("summary").get(function () {
  const units = this.units || [];
  if (units.length === 0) return "No units";
  const totalBedrooms = units.reduce((sum: number, unit: any) => sum + (unit.bedrooms || 0), 0);
  const totalBathrooms = units.reduce((sum: number, unit: any) => sum + (unit.bathrooms || 0), 0);
  const totalSqFt = units.reduce((sum: number, unit: any) => sum + (unit.squareFootage || 0), 0);
  return `${totalBedrooms}BR/${totalBathrooms}BA - ${totalSqFt} sq ft`;
});

// Static methods
PropertySchema.statics.findAvailable = function () {
  return this.find({ status: PropertyStatus.AVAILABLE, deletedAt: null });
};

PropertySchema.statics.findByOwner = function (ownerId: string) {
  return this.find({ ownerId, deletedAt: null });
};

PropertySchema.statics.findByManager = function (managerId: string) {
  return this.find({ managerId, deletedAt: null });
};

// CHANGE 5: new static — find all properties assigned to a specific agent
PropertySchema.statics.findByAgent = function (agentId: string) {
  return this.find({ assignedAgent: agentId, deletedAt: null });
};

PropertySchema.statics.search = function (query: string) {
  const searchRegex = new RegExp(query, "i");
  return this.find({
    $or: [
      { name: searchRegex },
      { description: searchRegex },
      { "address.street": searchRegex },
      { "address.city": searchRegex },
      { "address.state": searchRegex },
    ],
    deletedAt: null,
  });
};

// Instance methods
PropertySchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  this.status = PropertyStatus.UNAVAILABLE;
  return this.save();
};

PropertySchema.methods.restore = function () {
  this.deletedAt = null;
  this.status = PropertyStatus.AVAILABLE;
  return this.save();
};

PropertySchema.methods.updateStatus = function (status: PropertyStatus) {
  this.status = status;
  return this.save();
};

PropertySchema.methods.calculatePropertyStatus = function (): PropertyStatus {
  const hasUnits = Array.isArray(this.units) && this.units.length > 0;
  if (!hasUnits) return this.status;

  const unitStatuses = this.units
    .map((unit: any) => unit?.status)
    .filter((status: any): status is PropertyStatus =>
      Object.values(PropertyStatus).includes(status)
    );

  if (unitStatuses.length === 0) return this.status;

  const totalUnits = unitStatuses.length;
  const statusCounts = {
    available: unitStatuses.filter((s) => s === PropertyStatus.AVAILABLE).length,
    occupied: unitStatuses.filter((s) => s === PropertyStatus.OCCUPIED).length,
    maintenance: unitStatuses.filter((s) => s === PropertyStatus.MAINTENANCE).length,
    unavailable: unitStatuses.filter((s) => s === PropertyStatus.UNAVAILABLE).length,
  };

  if (statusCounts.occupied === totalUnits) return PropertyStatus.OCCUPIED;
  if (statusCounts.unavailable === totalUnits) return PropertyStatus.UNAVAILABLE;
  if (statusCounts.maintenance > 0 && statusCounts.available === 0) return PropertyStatus.MAINTENANCE;
  if (statusCounts.available > 0) return PropertyStatus.AVAILABLE;
  return PropertyStatus.AVAILABLE;
};

PropertySchema.methods.updatePropertyStatusFromUnits = async function () {
  const hasUnits = Array.isArray(this.units) && this.units.length > 0;
  if (hasUnits) {
    const newStatus = this.calculatePropertyStatus();
    if (this.status !== newStatus) {
      this.status = newStatus;
      await this.save();
      return newStatus;
    }
  }
  return this.status;
};

// Query middleware to exclude soft deleted documents by default
PropertySchema.pre(/^find/, function () {
  const query = this.getQuery();
  if (!query.hasOwnProperty("deletedAt")) {
    // @ts-ignore
    this.find({ deletedAt: null });
  }
});

// Pre-save middleware
PropertySchema.pre("save", async function (next) {
  // Strip deprecated fields that should only exist at unit level
  const deprecatedFields = ["bedrooms", "bathrooms", "squareFootage", "rentAmount", "securityDeposit"];
  deprecatedFields.forEach((field) => {
    if ((this as any)[field] !== undefined) {
      (this as any)[field] = undefined;
    }
  });

  // CHANGE 6: clear assignedAgent when property type is not HMO
  // Prevents stale agent references on non-HMO properties
  if (this.isModified("type") && this.type !== PropertyType.HMO) {
    this.assignedAgent = null;
  }

  // Auto-calculate status metadata from units
  if (this.isModified("units") || this.isNew) {
    this.totalUnits = this.units?.length || 1;
    this.isMultiUnit = this.totalUnits > 1;

    if (this.units && this.units.length > 0) {
      const calculatedStatus = this.calculatePropertyStatus();
      if (this.status !== calculatedStatus) {
        this.status = calculatedStatus;
      }
    }
  }

  if (this.isModified("status") && !this.isNew) {
    this._oldStatus = this.getChanges().$set?.status || this.status;
  }

  // Validate owner
  if (this.isModified("ownerId")) {
    const User = mongoose.model("User");
    const owner = await User.findById(this.ownerId);
    if (!owner) return next(new Error("Property owner not found"));
    if (!["admin", "manager"].includes(owner.role)) return next(new Error("Invalid owner role"));
  }

  // Validate manager if provided
  if (this.isModified("managerId") && this.managerId) {
    const User = mongoose.model("User");
    const manager = await User.findById(this.managerId);
    if (!manager) return next(new Error("Property manager not found"));
    if (!["admin", "manager"].includes(manager.role)) return next(new Error("Invalid manager role"));
  }

  // CHANGE 7: validate assignedAgent when type is HMO
  // Ensures the referenced user exists and has an appropriate role
  if (this.isModified("assignedAgent") && this.assignedAgent && this.type === PropertyType.HMO) {
    const User = mongoose.model("User");
    const agent = await User.findById(this.assignedAgent);
    if (!agent) return next(new Error("Assigned agent not found"));
    if (agent.role === "tenant") return next(new Error("Tenant cannot be assigned as an HMO agent"));
  }

  next();
});

// Post-save middleware
PropertySchema.post("save", async function (doc) {
  try {
    if (doc.isMultiUnit && doc.units && doc.units.length > 0) {
      const calculatedStatus = doc.calculatePropertyStatus();
      if (doc.status !== calculatedStatus) {
        if (process.env.NODE_ENV === "development") {
          doc.status = calculatedStatus;
          await doc.save();
        }
      }
    }
    if (doc._oldStatus) delete doc._oldStatus;
  } catch {
    // Don't throw — avoid breaking the save operation
  }
});

// Model initialisation with safe re-use
let Property: Model<IProperty>;
try {
  Property = mongoose.model<IProperty>("Property");
} catch (error) {
  Property = mongoose.model<IProperty>("Property", PropertySchema);
}

export default Property;