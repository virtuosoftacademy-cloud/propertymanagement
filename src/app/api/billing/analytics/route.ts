/**
 * PropertyPro - Subscription analytics
 *
 * Revenue trend derived from the embedded payment ledgers. There is no event
 * log of past subscription states, so the series only covers months the ledger
 * actually reaches — see buildRevenueHistory for why missing months are omitted
 * rather than zero-filled.
 *
 * Uses the same visibility rule as the subscriptions list: a subscription whose
 * user has been deleted is excluded, along with its payments. Counting revenue
 * the list does not show would make the two pages disagree.
 */

import { Subscription, User } from "@/models";
import { UserRole } from "@/types";
import type { SubscriptionAnalyticsView } from "@/types/billing";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import {
  flattenPayments,
  loadVisibleSubscriptions,
  serializeSubscription,
} from "@/lib/billing/serialize";
import { buildRevenueHistory } from "@/lib/billing/summarise";

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    // One read: payments live on the subscription, so there is no second
    // collection to join against.
    const { docs, names, hidden } = await loadVisibleSubscriptions(
      Subscription,
      User
    );

    if (hidden > 0) {
      console.warn(
        `[billing] analytics excluded ${hidden} subscription(s) — their user is deleted`
      );
    }

    const accounts = docs.map((d) =>
      serializeSubscription(d, names.get(String(d.userId ?? "")))
    );
    const payments = flattenPayments(docs);

    const view: SubscriptionAnalyticsView = {
      history: buildRevenueHistory(accounts, payments),
      accounts,
    };

    return createSuccessResponse(view);
  } catch (error) {
    return handleApiError(error);
  }
});
