/**
 * PropertyPro - Enabled payment methods
 *
 * Single source of truth for which payment methods the app currently offers.
 *
 * Rent is CASH ONLY for now. The Stripe integration is left intact but is not
 * reachable from any payment screen — restricting the choice here is what makes
 * that true, rather than deleting working code we may want back.
 *
 * TO RE-ENABLE ONLINE PAYMENTS: add the methods back to ENABLED_PAYMENT_METHODS
 * below. Everything else — the tenant Pay Rent screen, the manager's
 * record-payment form and the method selector — reads from this list.
 *
 * Enforced on BOTH sides: the screens below only offer the enabled methods, and
 * the payment-writing API routes reject anything else via
 * `assertPaymentMethodEnabled`. Hiding a control is not a restriction — a
 * crafted request or a stale client would otherwise still store a card payment.
 */

import { PaymentMethod } from "@/types";

export const ENABLED_PAYMENT_METHODS: PaymentMethod[] = [PaymentMethod.CASH];

/** True when at least one card/bank method is available. */
export const isOnlinePaymentEnabled = (): boolean =>
  ENABLED_PAYMENT_METHODS.some((method) =>
    [
      PaymentMethod.CREDIT_CARD,
      PaymentMethod.DEBIT_CARD,
      PaymentMethod.ACH,
      PaymentMethod.BANK_TRANSFER,
    ].includes(method)
  );

export const isMethodEnabled = (method: PaymentMethod): boolean =>
  ENABLED_PAYMENT_METHODS.includes(method);

/** The method to preselect — cash while it is the only option. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod =
  ENABLED_PAYMENT_METHODS[0] ?? PaymentMethod.CASH;

/**
 * Server-side guard. Returns an error message when the method is not currently
 * offered, or null when it is allowed.
 *
 * Accepts the raw request value (unknown) rather than a PaymentMethod, because
 * that is what actually arrives from a request body — an unrecognised string
 * must be rejected too, not cast.
 *
 *   const bad = assertPaymentMethodEnabled(body.paymentMethod);
 *   if (bad) return createErrorResponse(bad, 400);
 */
export function assertPaymentMethodEnabled(method: unknown): string | null {
  const enabled = ENABLED_PAYMENT_METHODS as string[];

  if (typeof method !== "string" || !enabled.includes(method)) {
    const offered = ENABLED_PAYMENT_METHODS.map(
      (m) => PAYMENT_METHOD_LABELS[m] ?? m
    ).join(", ");

    return `Payment method "${String(
      method
    )}" is not currently accepted. Allowed: ${offered}.`;
  }

  return null;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CREDIT_CARD]: "Credit card",
  [PaymentMethod.DEBIT_CARD]: "Debit card",
  [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
  [PaymentMethod.ACH]: "ACH",
  [PaymentMethod.CHECK]: "Cheque",
  [PaymentMethod.CASH]: "Cash",
  [PaymentMethod.MONEY_ORDER]: "Money order",
  [PaymentMethod.OTHER]: "Other",
};
