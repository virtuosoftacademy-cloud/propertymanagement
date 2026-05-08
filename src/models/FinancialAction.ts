import mongoose, { Model, Schema, Types } from "mongoose";
import {
  FinancialActionCategory,
  FinancialActionPriority,
  FinancialActionReportType,
  FinancialActionStatus,
} from "@/types/financial-analytics";

const STATUS_VALUES: FinancialActionStatus[] = [
  "pending",
  "in-progress",
  "completed",
];

const PRIORITY_VALUES: FinancialActionPriority[] = ["low", "medium", "high"];

const CATEGORY_VALUES: FinancialActionCategory[] = [
  "revenue",
  "collections",
  "profitability",
  "cash-flow",
  "expenses",
  "portfolio",
  "risk",
  "general",
];

const REPORT_TYPE_VALUES: FinancialActionReportType[] = [
  "analytics",
  "profit-loss",
  "cash-flow",
  "property-performance",
  "expense-analysis",
  "summary",
];

export interface IFinancialAction {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  status: FinancialActionStatus;
  priority: FinancialActionPriority;
  category: FinancialActionCategory;
  reportType: FinancialActionReportType;
  dueDate?: Date;
  propertyId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  completedAt?: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type FinancialActionDocument = mongoose.Document & IFinancialAction;

const FinancialActionSchema = new Schema<FinancialActionDocument>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title must be 200 characters or less"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [4000, "Description must be 4000 characters or less"],
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: PRIORITY_VALUES,
      default: "medium",
      index: true,
    },
    category: {
      type: String,
      enum: CATEGORY_VALUES,
      default: "general",
    },
    reportType: {
      type: String,
      enum: REPORT_TYPE_VALUES,
      default: "analytics",
    },
    dueDate: {
      type: Date,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    completedAt: {
      type: Date,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator(tags: string[]) {
          return tags.every((tag) => tag.trim().length > 0 && tag.length <= 40);
        },
        message: "Tags must be non-empty strings up to 40 characters",
      },
      set: (tags: string[]) => tags.map((tag) => tag.trim()),
    },
  },
  {
    timestamps: true,
  }
);

FinancialActionSchema.index({ status: 1, priority: -1, dueDate: 1 });
FinancialActionSchema.index({ category: 1, reportType: 1 });
FinancialActionSchema.index({ createdAt: -1 });

FinancialActionSchema.pre("save", function (next) {
  const document = this as FinancialActionDocument;

  if (document.isModified("status")) {
    if (document.status === "completed" && !document.completedAt) {
      document.completedAt = new Date();
    }

    if (document.status !== "completed") {
      document.completedAt = undefined;
    }
  }

  next();
});

let FinancialAction: Model<FinancialActionDocument>;

try {
  FinancialAction = mongoose.model<FinancialActionDocument>("FinancialAction");
} catch {
  FinancialAction = mongoose.model<FinancialActionDocument>(
    "FinancialAction",
    FinancialActionSchema
  );
}

export default FinancialAction;
