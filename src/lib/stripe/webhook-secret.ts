/**
 * PropertyPro - Stripe webhook signing secrets
 *
 * There are TWO independent Stripe webhook endpoints in this app, and they are
 * separate on purpose — different money flows, different handlers:
 *
 *   subscription  /api/billing/webhook   manager accounts, plans, Stripe subs
 *   rent          /api/stripe/webhook    tenant rent payment intents/invoices
 *
 * Each must have its OWN signing secret, from its own endpoint registered in
 * the Stripe dashboard. The signature check is the only thing establishing
 * that a request genuinely came from the endpoint it claims to be — give both
 * routes the same secret and each will happily accept and process the other's
 * events. `invoice.payment_failed` is emitted into both flows, so that overlap
 * is not hypothetical.
 *
 * LOCALLY the two necessarily share a secret, and that is not fixable: the
 * Stripe CLI's signing secret (`stripe listen --print-secret`) is per ACCOUNT,
 * not per listener — running two `stripe listen` processes returns the same
 * whsec to both. So in development the collision is expected and this only
 * warns.
 *
 * IN PRODUCTION the secrets come from two separate endpoints registered in the
 * Stripe dashboard (Developers → Webhooks → Add endpoint), each with its own
 * signing secret:
 *
 *   https://<host>/api/billing/webhook  → STRIPE_SUBSCRIPTION_WEBHOOK_SECRET
 *     checkout.session.completed, invoice.paid, invoice.payment_failed,
 *     customer.subscription.updated, customer.subscription.deleted
 *
 *   https://<host>/api/stripe/webhook   → STRIPE_WEBHOOK_SECRET
 *     payment_intent.succeeded, payment_intent.payment_failed,
 *     payment_intent.processing, payment_intent.requires_action,
 *     payment_method.attached, customer.created,
 *     invoice.payment_succeeded, invoice.payment_failed
 *
 * Sharing one secret there is a real misconfiguration, so it is refused
 * outright rather than quietly accepted.
 */

export type StripeWebhookFlow = "subscription" | "rent";

const ENV_VAR: Record<StripeWebhookFlow, string> = {
  subscription: "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
  rent: "STRIPE_WEBHOOK_SECRET",
};

export interface ResolvedWebhookSecret {
  /** Present only when the configuration is usable. */
  secret?: string;
  /** Present when the caller should refuse the request. */
  error?: { message: string; status: number };
}

/** Warn once per process per flow, rather than on every delivery. */
const warned = new Set<string>();

export function resolveWebhookSecret(
  flow: StripeWebhookFlow
): ResolvedWebhookSecret {
  const subscription = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  const rent = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = flow === "subscription" ? subscription : rent;

  if (!secret) {
    console.error(
      `[stripe] ${ENV_VAR[flow]} is not set — the ${flow} webhook cannot verify signatures.`
    );
    return {
      error: { message: "Webhook is not configured", status: 503 },
    };
  }

  const shared = Boolean(subscription && rent && subscription === rent);

  if (shared) {
    const detail =
      `[stripe] ${ENV_VAR.subscription} and ${ENV_VAR.rent} are the SAME value. ` +
      `Each endpoint needs its own signing secret, or either route will accept ` +
      `the other's events (invoice.payment_failed reaches both).`;

    if (process.env.NODE_ENV === "production") {
      console.error(`${detail} Refusing the delivery.`);
      return {
        error: {
          message:
            "Webhook secrets are misconfigured: both endpoints share one signing secret.",
          status: 503,
        },
      };
    }

    if (!warned.has(flow)) {
      warned.add(flow);
      console.warn(
        `${detail} Fine for a single local \`stripe listen\`; this is refused in production.`
      );
    }
  }

  return { secret };
}
