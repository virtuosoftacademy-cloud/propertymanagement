"use client";

/**
 * Your subscription — the account holder's own view.
 *
 * Distinct from /dashboard/admin/billing, which is the admin's ledger of every
 * client. This shows exactly one account (the caller's) and reads it from
 * /api/billing/me, which is scoped by userId server-side.
 *
 * The only thing it changes is whether the subscription renews — cancelling
 * and un-cancelling. Moving between plans still goes through Stripe Checkout,
 * so that stays a link out rather than a form.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CreditCard,
  Loader2,
  Receipt,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/formatting";
import { CancelSubscriptionDialog } from "@/components/billing/cancel-subscription-dialog";
import { showSimpleError, showSimpleSuccess } from "@/lib/toast-notifications";

const CARD_THEME =
  "border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background";

const STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past_due: { label: "Past due", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  expired: { label: "Expired", variant: "outline" },
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

interface BillingMe {
  subscription: {
    planId: string;
    status: string;
    amount: number;
    billingCycle: string;
    startedAt: string;
    renewsAt?: string;
    lastPaymentAt?: string;
    paymentMethod: string;
    cancelAtPeriodEnd?: boolean;
    /** Absent on a cash account, which cannot be cancelled from here. */
    stripeSubscriptionId?: string;
  } | null;
  payments: Array<{
    id: string;
    amount: number;
    receivedOn: string;
    method: string;
    periodLabel?: string;
  }>;
  usage: {
    planId: string;
    planName: string;
    limit: number | null;
    used: number;
  };
  plan: {
    id: string;
    name: string;
    description: string;
    monthlyPrice: number | null;
    features: string[];
  } | null;
}

export default function MySubscriptionPage() {
  const [data, setData] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/me", {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Could not load your subscription");
      }
      setData(payload.data as BillingMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cancel and resume are the same call with a flag, so they share a handler.
  const setCancellation = useCallback(
    async (resume: boolean) => {
      setCancelBusy(true);
      try {
        const response = await fetch("/api/billing/me/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ resume }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.success) {
          showSimpleError(
            resume ? "Could not resume" : "Could not cancel",
            payload?.error || "Please try again."
          );
          return;
        }

        showSimpleSuccess(
          resume ? "Subscription resumed" : "Cancellation scheduled",
          payload?.message ||
            (resume
              ? "Your subscription will continue."
              : "Your plan runs to the end of the current period.")
        );
        setCancelOpen(false);
        // Re-read rather than patching local state: the authority on what is
        // scheduled is Stripe, and load() reflects what was actually stored.
        await load();
      } catch {
        showSimpleError("Something went wrong", "Please try again.");
      } finally {
        setCancelBusy(false);
      }
    },
    [load]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <CreditCard className="h-7 w-7" />
          Your subscription
        </h1>
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sub = data?.subscription ?? null;
  const usage = data?.usage;
  const plan = data?.plan;
  const status = sub ? STATUS_META[sub.status] : null;

  // The role is what actually grants access, so the plan name comes from the
  // allowance rather than the subscription — an account granted a plan by an
  // admin has the role without a Stripe subscription behind it.
  const planName = plan?.name ?? usage?.planName ?? usage?.planId ?? "—";
  // Only a live Stripe subscription can be cancelled from here.
  const canCancel = Boolean(
    sub &&
      sub.stripeSubscriptionId &&
      sub.status !== "cancelled" &&
      sub.status !== "expired"
  );

  const atLimit =
    usage?.limit !== null &&
    usage !== undefined &&
    usage.limit !== null &&
    usage.used >= usage.limit;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <CreditCard className="h-7 w-7" />
            Your subscription
          </h1>
          <p className="text-muted-foreground">
            The plan this account is on, and what it has paid.
          </p>
        </div>

        <Button asChild variant={atLimit ? "default" : "outline"}>
          <Link href="/landing/pricing">
            {atLimit ? "Upgrade plan" : "Compare plans"}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Current plan */}
      <Card className={CARD_THEME}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{planName}</CardTitle>
              {plan?.description && (
                <CardDescription>{plan.description}</CardDescription>
              )}
            </div>
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">Price</p>
            <p className="text-2xl font-bold">
              {sub
                ? formatCurrency(sub.amount)
                : plan?.monthlyPrice
                  ? formatCurrency(plan.monthlyPrice)
                  : "Free"}
            </p>
            {sub && (
              <p className="text-muted-foreground text-xs">
                per {sub.billingCycle === "annual" ? "year" : "month"}
              </p>
            )}
          </div>

          <div>
            <p className="text-muted-foreground text-xs">Units used</p>
            <p className="text-2xl font-bold">
              {usage?.used ?? 0}
              {usage?.limit !== null && usage?.limit !== undefined && (
                <span className="text-muted-foreground text-base font-normal">
                  {" "}
                  / {usage.limit}
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {usage?.limit === null ? "Unlimited" : atLimit ? "Limit reached" : "Within limit"}
            </p>
          </div>

          <div>
            <p className="text-muted-foreground text-xs">Renews</p>
            <p className="text-lg font-medium">{formatDate(sub?.renewsAt)}</p>
            {sub?.cancelAtPeriodEnd && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Cancels at period end
              </p>
            )}
          </div>

          <div>
            <p className="text-muted-foreground text-xs">Last payment</p>
            <p className="text-lg font-medium">
              {formatDate(sub?.lastPaymentAt)}
            </p>
            {sub && (
              <p className="text-muted-foreground text-xs capitalize">
                paid by {sub.paymentMethod}
              </p>
            )}
          </div>
        </CardContent>

        {/* Cancelling is only offered on a live Stripe subscription. A cash
            account is an arrangement an admin recorded by hand, and a free
            plan has nothing to stop — the API refuses both, so the button
            should not be there to press. */}
        {canCancel && (
          <CardFooter className="border-t pt-4">
            {sub?.cancelAtPeriodEnd ? (
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <span className="font-medium">Cancellation scheduled.</span>{" "}
                  <span className="text-muted-foreground">
                    Access continues until {formatDate(sub.renewsAt)}.
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelBusy}
                  onClick={() => void setCancellation(true)}
                >
                  {cancelBusy ? "Working…" : "Resume subscription"}
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm">
                  Cancelling stops the next payment. You keep access until{" "}
                  {formatDate(sub?.renewsAt)}.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel subscription
                </Button>
              </div>
            )}
          </CardFooter>
        )}
      </Card>

      <CancelSubscriptionDialog
        planName={planName}
        endsOn={sub?.renewsAt}
        open={cancelOpen}
        busy={cancelBusy}
        onOpenChange={setCancelOpen}
        onConfirm={() => void setCancellation(false)}
      />

      {/* No subscription record — the role still grants access, so say so
          rather than showing an empty page that reads like a fault. */}
      {!sub && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">No billing record for this account</p>
              <p className="text-muted-foreground">
                You are on {planName} and everything works normally — there is
                just nothing to bill, either because the plan is free or because
                it was granted directly rather than bought.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What the plan includes */}
      {plan?.features?.length ? (
        <Card className={CARD_THEME}>
          <CardHeader>
            <CardTitle className="text-base">What is included</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Payment history */}
      <Card className={CARD_THEME}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Payment history
          </CardTitle>
          <CardDescription>
            Every payment recorded against this account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.payments?.length ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Period</th>
                    <th className="pb-2 font-medium">Method</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="py-3">{formatDate(payment.receivedOn)}</td>
                      <td className="text-muted-foreground py-3">
                        {payment.periodLabel || "—"}
                      </td>
                      <td className="py-3 capitalize">{payment.method}</td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
