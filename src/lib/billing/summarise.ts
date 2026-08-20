/**
 * PropertyPro - Manager billing summaries
 *
 * Pure derivation, no Node-only imports, so the API and any client view compute
 * the same figures from the same rows. Summaries are always derived and never
 * stored: a stored total can disagree with the table underneath it, and the
 * disagreement is invisible until someone reconciles by hand.
 */

import type {
  Subscription,
  Subscription,
  SubscriptionPaymentsSummary,
  SubscriptionRevenueSummary,
  MonthlyRevenuePoint,
} from "@/types/billing";
import { monthlyEquivalent } from "./plans";

function sameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === ref.getUTCFullYear() &&
    d.getUTCMonth() === ref.getUTCMonth()
  );
}

export function summariseSubscriptions(
  rows: Subscription[],
  now: Date = new Date()
): SubscriptionRevenueSummary {
  const active = rows.filter((r) => r.status === "active");

  return {
    totalAccounts: rows.length,
    activeAccounts: active.length,
    monthlyRevenue: active.reduce(
      (sum, r) => sum + monthlyEquivalent(r.amount, r.billingCycle),
      0
    ),
    renewalsThisMonth: active.filter(
      (r) => r.renewsAt && sameMonth(r.renewsAt, now)
    ).length,
    outstanding: rows
      .filter((r) => r.status === "past_due")
      .reduce((sum, r) => sum + r.amount, 0),
  };
}

export function summarisePayments(
  rows: Subscription[],
  now: Date = new Date()
): SubscriptionPaymentsSummary {
  const totalReceived = rows.reduce((sum, p) => sum + p.amount, 0);

  return {
    totalReceived,
    receivedThisMonth: rows
      .filter((p) => sameMonth(p.receivedOn, now))
      .reduce((sum, p) => sum + p.amount, 0),
    paymentCount: rows.length,
    averagePayment: rows.length > 0 ? totalReceived / rows.length : 0,
  };
}

const MONTH_KEY = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Twelve months of revenue trend, derived from the payments ledger and the
 * accounts' own start/cancel dates.
 *
 * There is no event log of past subscription states, so this reconstructs what
 * it honestly can: `mrr` is real money received in that month normalised to a
 * monthly figure, and the account counts come from startedAt / cancelled dates.
 * Months before the ledger begins are omitted rather than backfilled with
 * zeroes, because a flat zero line reads as "we lost all revenue" rather than
 * "we have no data".
 */
export function buildRevenueHistory(
  accounts: Subscription[],
  payments: Subscription[],
  now: Date = new Date(),
  months = 12
): MonthlyRevenuePoint[] {
  if (payments.length === 0 && accounts.length === 0) return [];

  // Earliest month we have anything to say about.
  const earliest = [
    ...payments.map((p) => new Date(p.receivedOn)),
    ...accounts.map((a) => new Date(a.startedAt)),
  ].reduce((min, d) => (d < min ? d : min));

  const points: MonthlyRevenuePoint[] = [];
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
  );
  const earliestMonth = new Date(
    Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1)
  );
  if (cursor < earliestMonth) cursor.setTime(earliestMonth.getTime());

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  while (cursor <= end) {
    const key = MONTH_KEY(cursor);
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
    );

    const received = payments.filter((p) => MONTH_KEY(new Date(p.receivedOn)) === key);

    // Money actually received that month, spread to a monthly figure so an
    // annual payment does not show as a one-month revenue spike.
    const mrr = received.reduce((sum, p) => {
      const account = accounts.find((a) => a.id === p.accountId);
      return sum + monthlyEquivalent(p.amount, account?.billingCycle ?? "monthly");
    }, 0);

    const started = accounts.filter((a) => new Date(a.startedAt) < monthEnd);
    const newAccounts = accounts.filter(
      (a) => MONTH_KEY(new Date(a.startedAt)) === key
    ).length;
    const cancelledAccounts = accounts.filter(
      (a) =>
        a.status === "cancelled" &&
        a.lastPaymentAt &&
        MONTH_KEY(new Date(a.lastPaymentAt)) === key
    ).length;

    points.push({
      month: key,
      label: cursor.toLocaleDateString("en-GB", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      mrr: Math.round(mrr * 100) / 100,
      activeAccounts: started.filter((a) => a.status !== "cancelled").length,
      newAccounts,
      cancelledAccounts,
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
}
