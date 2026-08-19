/**
 * PropertyPro - Feature comparison matrix
 *
 * The per-feature detail behind MANAGER_PLANS. Kept separate from plans.ts
 * because that file is the billing source of truth — ids, prices and unit
 * limits that the checkout, the webhook and ManagerAccount.planId all depend
 * on. This is presentation: it changes when marketing copy changes, and a typo
 * here cannot mis-charge anyone.
 *
 * A cell is either a tick/cross (boolean) or a value to print (string).
 */

export type ComparisonValue = boolean | string;

export interface ComparisonRow {
  label: string;
  /** Shown on hover/tap where the feature name alone is not self-explanatory. */
  hint?: string;
  free: ComparisonValue;
  pro: ComparisonValue;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

export const PLAN_COMPARISON: ComparisonGroup[] = [
  {
    title: "Units and pricing",
    rows: [
      { label: "Rental units", free: "1 unit", pro: "Unlimited" },
      {
        label: "Per-unit cost",
        hint: "Charged monthly on top of the flat price, for units beyond the first five.",
        free: "Free",
        pro: "1–5 included, then £1.50/unit/month",
      },
      { label: "Single lets", free: true, pro: true },
      { label: "HMOs", free: false, pro: true },
    ],
  },
  {
    title: "Compliance",
    rows: [
      { label: "Compliance checklists", free: false, pro: true },
      { label: "New tenancy checklist", free: false, pro: true },
      { label: "Safety certificate storage", free: false, pro: true },
      { label: "Safety certificate reminders", free: false, pro: true },
      { label: "EPC storage", free: false, pro: true },
      { label: "EPC reminders", free: false, pro: true },
      { label: "Right to Rent documents", free: false, pro: true },
      {
        label: "Licensing compliance",
        hint: "England only.",
        free: false,
        pro: true,
      },
      { label: "Document storage", free: false, pro: "Unlimited" },
    ],
  },
  {
    title: "Inventory",
    rows: [
      { label: "Inventory builder", free: true, pro: true },
      { label: "Inventory images", free: true, pro: true },
      { label: "Inventory signing", free: false, pro: true },
    ],
  },
  {
    title: "Finances and accounts",
    rows: [
      { label: "Rent record", free: true, pro: true },
      { label: "Rent record CSV download", free: true, pro: true },
      { label: "Expenses", free: true, pro: true },
      { label: "Expense documents", free: true, pro: "Unlimited" },
      { label: "Repeating expenses", free: true, pro: true },
      { label: "Tax return", free: true, pro: true },
      {
        label: "Making Tax Digital ready",
        hint: "Records are kept in the format HMRC's MTD for Income Tax requires.",
        free: true,
        pro: true,
      },
      { label: "Track mortgages", free: true, pro: true },
      { label: "Fixed rate expiry reminders", free: true, pro: true },
      { label: "Open Banking — expense creation", free: false, pro: true },
      { label: "Open Banking — rent receipts", free: false, pro: true },
      { label: "Open Banking — automatic matching", free: false, pro: true },
    ],
  },
  {
    title: "Tenant communications",
    rows: [
      { label: "Property manuals", free: true, pro: "Unlimited" },
      { label: "Auto-send manuals to tenants", free: true, pro: true },
      { label: "Tenant portal", free: false, pro: true },
      { label: "Tenant document access", free: false, pro: true },
      { label: "Tenant maintenance reports", free: false, pro: true },
      { label: "Tenant communications", free: false, pro: true },
    ],
  },
  {
    title: "Maintenance",
    rows: [
      { label: "Maintenance tracking", free: true, pro: true },
      { label: "Maintenance image uploads", free: true, pro: true },
      {
        label: "Agent, landlord and contractor records",
        free: true,
        pro: true,
      },
      { label: "Property images", free: true, pro: "Unlimited" },
    ],
  },
  {
    title: "Reports and exports",
    rows: [
      { label: "Profit and loss report", free: true, pro: true },
      { label: "Insights and reports", free: true, pro: true },
      {
        label: "Portfolio spreadsheet",
        hint: "The summary a mortgage broker usually asks for.",
        free: true,
        pro: true,
      },
      { label: "Full data export and backup", free: true, pro: true },
    ],
  },
  {
    title: "Suppliers, landlords and ownership",
    rows: [
      { label: "Council contact details", free: true, pro: true },
      { label: "Supplier directory", free: true, pro: true },
      { label: "Multiple landlords", free: true, pro: true },
      { label: "Property ownership splitting", free: true, pro: true },
    ],
  },
  {
    title: "Contracts and e-signatures",
    rows: [
      { label: "AST builder", free: false, pro: true },
      { label: "Built-in e-signature collection", free: false, pro: true },
      { label: "E-signature — AST", free: false, pro: true },
      { label: "E-signature — inventory", free: false, pro: true },
      { label: "E-signature — safety certificates", free: false, pro: true },
      {
        label: "E-signature — prescribed information",
        free: false,
        pro: true,
      },
    ],
  },
  {
    title: "Advanced features",
    rows: [
      { label: "Advanced key management", free: false, pro: true },
      { label: "Planning application monitoring", free: false, pro: true },
      { label: "Additional users and permissions", free: false, pro: true },
    ],
  },
  {
    title: "Support",
    rows: [
      {
        label: "Email support",
        hint: "Within one working day.",
        free: true,
        pro: true,
      },
      { label: "Phone and video support", free: true, pro: true },
      { label: "Online training", free: true, pro: true },
      { label: "Introductory training call", free: false, pro: true },
    ],
  },
];
