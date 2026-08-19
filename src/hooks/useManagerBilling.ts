/**
 * PropertyPro - Manager billing data hooks
 *
 * Client-side reads for the admin billing area, replacing the mock fixtures the
 * pages used to import. Same shape as the other hooks in this folder
 * ({ data, loading, error, refetch }) so the pages read consistently.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ManagerAccountsView,
  ManagerAnalyticsView,
  ManagerPaymentsView,
  SelectableUser,
} from "@/types/billing";

interface Result<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function useBillingResource<T>(url: string): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, { credentials: "include" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error || `Request failed with status ${response.status}`
        );
      }

      setData(payload.data as T);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Deliberately leave `data` as-is: on a refetch failure the last good
      // figures are better than blanking a revenue table to nothing.
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

export function useManagerAccounts() {
  return useBillingResource<ManagerAccountsView>(
    "/api/billing/manager-accounts"
  );
}

export function useManagerPayments(accountId?: string) {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return useBillingResource<ManagerPaymentsView>(
    `/api/billing/manager-payments${query}`
  );
}

export function useManagerAnalytics() {
  return useBillingResource<ManagerAnalyticsView>("/api/billing/analytics");
}

export function useSelectableUsers() {
  return useBillingResource<SelectableUser[]>("/api/billing/selectable-users");
}

/** Empty views, so a page can render its normal layout before data arrives. */
export const EMPTY_ACCOUNTS_VIEW: ManagerAccountsView = {
  summary: {
    totalAccounts: 0,
    activeAccounts: 0,
    monthlyRevenue: 0,
    renewalsThisMonth: 0,
    outstanding: 0,
  },
  accounts: [],
};

export const EMPTY_PAYMENTS_VIEW: ManagerPaymentsView = {
  summary: {
    totalReceived: 0,
    receivedThisMonth: 0,
    paymentCount: 0,
    averagePayment: 0,
  },
  payments: [],
};
