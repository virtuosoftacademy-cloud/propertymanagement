/**
 * PropertyPro - Manager billing analytics API
 *
 * Revenue trend derived from the payments ledger. There is no event log of past
 * subscription states, so the series only covers months the ledger actually
 * reaches — see buildRevenueHistory for why missing months are omitted rather
 * than zero-filled.
 */

import { Subscription, Subscription } from "@/models";
import { UserRole } from "@/types";
import type { SubscriptionAnalyticsView } from "@/types/billing";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { serializeSubscription, serializePayment } from "@/lib/billing/serialize";
import { buildRevenueHistory } from "@/lib/billing/summarise";

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    const [accountDocs, paymentDocs] = await Promise.all([
      Subscription.find({})
        .populate("userId", "firstName lastName name")
        .sort({ createdAt: -1 })
        .lean(),
      Subscription.find({}).sort({ receivedOn: -1 }).lean(),
    ]);

    const accounts = (accountDocs as any[]).map(serializeSubscription);
    const payments = (paymentDocs as any[]).map(serializePayment);

    const view: SubscriptionAnalyticsView = {
      history: buildRevenueHistory(accounts, payments),
      accounts,
    };

    return createSuccessResponse(view);
  } catch (error) {
    return handleApiError(error);
  }
});
