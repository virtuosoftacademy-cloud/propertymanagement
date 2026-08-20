"use client";

/**
 * Edit subscription — ADMIN only.
 *
 * The guard is inherited: this route sits under
 * src/app/dashboard/admin/billing/layout.tsx, which redirects anyone who is not
 * an ADMIN before the page renders. No extra check is needed here.
 *
 * UI ONLY. The account is read from the mock fixture; submitting validates and
 * returns to the list without persisting anything.
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileX, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ManagerAccountForm } from "@/components/billing/manager-account-form";
import { showSimpleError, showSimpleSuccess } from "@/lib/toast-notifications";
import { useManagerAccounts } from "@/hooks/useManagerBilling";
import { resolvePlan } from "@/lib/billing/plans";
import type { ManagerAccountFormValues } from "@/lib/billing/manager-account-schema";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB");
};

export default function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const backToList = () => router.push("/dashboard/admin/billing");

  const { data, loading } = useManagerAccounts();
  const account = (data?.accounts ?? []).find((row) => row.id === id);

  // Distinguish "still loading" from "gone": the not-found copy below is a
  // claim about the data, and making it before the request lands is a lie.
  if (loading && !data) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading subscription…
      </div>
    );
  }

  // A stale link or a deleted account lands here — say so rather than
  // rendering an empty form that would silently create a new record.
  if (!account) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={backToList}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manager Accounts
        </Button>

        <div className="py-16 text-center">
          <FileX className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-1 text-lg font-medium">Subscription not found</h3>
          <p className="text-muted-foreground">
            This account may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const plan = resolvePlan(account.planId);

  const handleSubmit = async (values: ManagerAccountFormValues) => {
    const response = await fetch(`/api/billing/manager-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      showSimpleError(
        "Not saved",
        result?.error || "The subscription could not be updated."
      );
      return;
    }

    showSimpleSuccess(
      "Subscription updated",
      `${values.clientName} has been saved.`
    );
    backToList();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1 flex justify-between items-center">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Pencil className="h-7 w-7" />
          Edit subscription
        </h1>

        <Button
          variant="ghost"
          size="sm"
          onClick={backToList}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manager Accounts
        </Button>

      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
            <CardContent className="pt-6">
              <ManagerAccountForm
                account={account}
                onSubmit={handleSubmit}
                onCancel={backToList}
                submitLabel="Save changes"
              />
            </CardContent>
          </Card>
        </div>

        {/* Current state, for reference while editing — the form fields show
            what is being changed to, not what it is now. */}
        <div className="lg:col-span-1">
          <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
            <CardHeader>
              <CardTitle className="text-base">Current</CardTitle>
              <CardDescription>Before your changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Plan</dt>
                  <dd className="font-medium">
                    {plan?.name ?? account.planId}{" "}
                    <span className="text-muted-foreground capitalize">
                      · {account.billingCycle}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Amount</dt>
                  <dd className="font-medium">
                    £{account.amount.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Status</dt>
                  <dd>
                    <Badge
                      variant={
                        account.status === "active"
                          ? "default"
                          : account.status === "past_due"
                            ? "destructive"
                            : "outline"
                      }
                      className="capitalize"
                    >
                      {account.status.replace(/_/g, " ")}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Started</dt>
                  <dd className="font-medium">
                    {formatDate(account.startedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Last paid</dt>
                  <dd className="font-medium">
                    {formatDate(account.lastPaymentAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Renews</dt>
                  <dd className="font-medium">
                    {formatDate(account.renewsAt)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
