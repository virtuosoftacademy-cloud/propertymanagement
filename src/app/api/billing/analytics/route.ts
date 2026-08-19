/**
 * PropertyPro - Manager billing analytics API
 *
 * Revenue trend derived from the payments ledger. There is no event log of past
 * subscription states, so the series only covers months the ledger actually
 * reaches — see buildRevenueHistory for why missing months are omitted rather
 * than zero-filled.
 */

import { ManagerAccount, ManagerPayment } from "@/models";
import { UserRole } from "@/types";
import type { ManagerAnalyticsView } from "@/types/billing";
import {
  createSuccessResponse,
  handleApiError,
  withRoleAndDB,
} from "@/lib/api-utils";
import { serializeAccount, serializePayment } from "@/lib/billing/serialize";
import { buildRevenueHistory } from "@/lib/billing/summarise";

export const GET = withRoleAndDB([UserRole.ADMIN])(async () => {
  try {
    const [accountDocs, paymentDocs] = await Promise.all([
      ManagerAccount.find({})
        .populate("managerUserId", "firstName lastName name")
        .sort({ createdAt: -1 })
        .lean(),
      ManagerPayment.find({}).sort({ receivedOn: -1 }).lean(),
    ]);

    const accounts = (accountDocs as any[]).map(serializeAccount);
    const payments = (paymentDocs as any[]).map(serializePayment);

    const view: ManagerAnalyticsView = {
      history: buildRevenueHistory(accounts, payments),
      accounts,
    };

    return createSuccessResponse(view);
  } catch (error) {
    return handleApiError(error);
  }
});
