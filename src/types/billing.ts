/**
 * PropertyPro - Manager account types
 *
 * The revenue model: a client pays the ADMIN to be given a Manager account.
 * The admin is the vendor here — money flows IN, not out — so these types
 * describe accounts sold, not a bill the org owes.
 *
 * Shared between server and client, so nothing here may import Node-only
 * modules. The Manager Accounts page currently renders mock fixtures shaped by
 * these types, so wiring it to a real endpoint later is a fetch swap.
 */

// ============================================================================
// Manager accounts (what clients pay the admin for)
// ============================================================================

export type ManagerAccountStatus =
  | "pending" // sold, not yet paid or not yet provisioned
  | "active"
  | "past_due" // renewal missed
  | "cancelled"
  | "expired";

/**
 * How the client paid. `cash` is recorded by the admin after the fact; `card`
 * is collected by Stripe and written by the subscription webhook. Never widen
 * this to a method the app cannot actually process — the value is the record of
 * how the money really moved.
 */
export type ManagerPaymentMethod = "cash" | "card";

export interface ManagerAccount {
  id: string;
  /** The person the account is sold to — the selected user's name. */
  clientName: string;
  /**
   * Trading name of the company or landlord being billed, when it differs from
   * the person. Optional: a sole trader is billed under their own name.
   */
  companyName?: string;
  contactEmail: string;
  contactPhone?: string;
  /** The provisioned Manager user, once it exists. */
  managerUserId?: string;
  managerName?: string;
  planId: string;
  status: ManagerAccountStatus;
  /** What this client pays per cycle, in GBP. */
  amount: number;
  billingCycle: "monthly" | "annual";
  startedAt: string; // ISO
  renewsAt?: string; // ISO — next payment due from the client
  lastPaymentAt?: string; // ISO
  paymentMethod: ManagerPaymentMethod;
  notes?: string;
  /** Present once the account is billed through Stripe rather than by cash. */
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  /** Set while a Stripe subscription is scheduled to end at period close. */
  cancelAtPeriodEnd?: boolean;
}

// ============================================================================
// Payments received from clients
// ============================================================================

/**
 * One payment received from a client. A `cash` payment is recorded after the
 * fact, so `recordedBy` is the only trace of who took the money; a `card`
 * payment is written by the Stripe webhook, where `recordedBy` is "Stripe" and
 * the invoice id is the authoritative trace.
 */
export interface ManagerPayment {
  id: string;
  accountId: string;
  /** Denormalised for display, so the ledger reads without joining. */
  clientName: string;
  companyName?: string;
  planId: string;
  amount: number;
  receivedOn: string; // ISO
  method: ManagerPaymentMethod;
  recordedBy: string;
  /** The cycle this payment covered, for reconciling against renewals. */
  periodLabel?: string;
  notes?: string;
  /** Set for card payments — the Stripe invoice this row was written from. */
  stripeInvoiceId?: string;
}

export interface ManagerPaymentsSummary {
  totalReceived: number;
  receivedThisMonth: number;
  paymentCount: number;
  averagePayment: number;
}

export interface ManagerPaymentsView {
  summary: ManagerPaymentsSummary;
  payments: ManagerPayment[];
}

// ============================================================================
// View model
// ============================================================================

export interface ManagerRevenueSummary {
  totalAccounts: number;
  activeAccounts: number;
  /** Sum of active accounts normalised to a monthly figure, in GBP. */
  monthlyRevenue: number;
  /** Active accounts whose renewal falls inside the current calendar month. */
  renewalsThisMonth: number;
  /** Amount owed across past_due accounts, in GBP. */
  outstanding: number;
}

export interface ManagerAccountsView {
  summary: ManagerRevenueSummary;
  accounts: ManagerAccount[];
}

/**
 * One month of the revenue trend. Derived from the payments ledger rather than
 * stored: there is no event log of past subscription states, so a month only
 * exists here once money was actually received in it. Expect a short series
 * until the ledger has accrued history.
 */
export interface MonthlyRevenuePoint {
  /** yyyy-mm, sorted oldest first. */
  month: string;
  label: string;
  mrr: number;
  activeAccounts: number;
  newAccounts: number;
  cancelledAccounts: number;
}

export interface ManagerAnalyticsView {
  history: MonthlyRevenuePoint[];
  accounts: ManagerAccount[];
}

/** A user the admin can attach a manager account to. */
export interface SelectableUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** Trading name, when they operate as a company rather than a sole trader. */
  company?: string;
  /** Already tied to a manager account — shown but not selectable again. */
  hasAccount?: boolean;
}
