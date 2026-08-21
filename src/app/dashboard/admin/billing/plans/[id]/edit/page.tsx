"use client";

/**
 * Edit plan — ADMIN only.
 *
 * The guard is inherited from src/app/dashboard/admin/billing/layout.tsx.
 *
 * UI ONLY. The plan is read from the const catalogue in
 * src/lib/billing/plans.ts; saving validates and returns to the list without
 * persisting anything.
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileX, Layers, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlanForm } from "@/components/billing/plan-form";
import { showSimpleError, showSimpleSuccess } from "@/lib/toast-notifications";
import { resolvePlan } from "@/lib/billing/plans";
import { useManagerAccounts } from "@/hooks/useManagerBilling";
import type { PlanFormValues } from "@/lib/billing/plan-schema";

export default function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const backToPlans = () => router.push("/dashboard/admin/billing/plans");

  // TODO(billing): replace with GET /api/plans/[id] once plans are persisted.
  const plan = resolvePlan(id);

  const { data } = useManagerAccounts();
  const accountsOnPlan = (data?.accounts ?? []).filter(
    (account) => account.planId === id
  );

  if (!plan) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={backToPlans}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Plans
        </Button>

        <div className="py-16 text-center">
          <FileX className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-1 text-lg font-medium">Plan not found</h3>
          <p className="text-muted-foreground">
            No plan exists with the ID &ldquo;{id}&rdquo;.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (values: PlanFormValues) => {
    const response = await fetch(`/api/billing/plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      showSimpleError(
        "Not saved",
        result?.error || "The plan could not be updated."
      );
      return;
    }

    showSimpleSuccess("Plan updated", `${values.name} has been saved.`);
    backToPlans();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={backToPlans}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Plans
        </Button>

        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Layers className="h-7 w-7" />
          Edit plan
        </h1>
        <p className="text-muted-foreground">{plan.name}</p>
      </div>

      {/* Changing a plan changes what existing accounts are measured against,
          so say how many are affected before the admin edits anything. */}
      {accountsOnPlan.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {accountsOnPlan.length} account
                {accountsOnPlan.length === 1 ? " is" : "s are"} on this plan
              </p>
              <p className="text-muted-foreground">
                Price changes here do not alter what those accounts already pay
                — each carries its own agreed amount. Changing the unit limit
                does apply to them.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="max-w-3xl">
        <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
          <CardHeader>
            <CardTitle className="text-base">Plan details</CardTitle>
            <CardDescription>
              The plan ID is used by existing accounts — changing it is a
              migration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanForm
              plan={plan}
              onSubmit={handleSubmit}
              onCancel={backToPlans}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
