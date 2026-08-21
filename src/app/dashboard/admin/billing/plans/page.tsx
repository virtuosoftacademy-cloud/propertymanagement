"use client";

/**
 * Plans — ADMIN only.
 *
 * The guard is inherited from src/app/dashboard/admin/billing/layout.tsx.
 *
 * UI ONLY. Plans currently come from the const catalogue in
 * src/lib/billing/plans.ts, so this page reads that; adding one does not yet
 * persist anywhere.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeletePlanDialog } from "@/components/billing/delete-plan-dialog";
import { showSimpleError, showSimpleSuccess } from "@/lib/toast-notifications";
import { type ManagerPlan } from "@/lib/billing/plans";
import { useManagerAccounts, usePlans } from "@/hooks/useManagerBilling";

export default function PlansPage() {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<ManagerPlan | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // How many accounts sit on each plan — the number that decides whether a plan
  // can be retired, so it belongs next to the plan rather than a click away.
  const { data } = useManagerAccounts();
  const accounts = data?.accounts ?? [];

  // The live catalogue, not the const — a plan created here must show up here.
  const { data: plans, refetch: refetchPlans } = usePlans();
  const MANAGER_PLANS = (plans ?? []) as ManagerPlan[];
  const usage = (planId: string) =>
    accounts.filter((account) => account.planId === planId).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin/billing")}
          className="-ml-2 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Manager Accounts
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <Layers className="h-7 w-7" />
              Plans
            </h1>
            <p className="text-muted-foreground">
              What you sell manager accounts for.
            </p>
          </div>

          <Button onClick={() => router.push("/dashboard/admin/billing/plans/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Add plan
          </Button>
        </div>
      </div>

      {/* Catalogue */}
      {MANAGER_PLANS.length === 0 ? (
        <div className="py-16 text-center">
          <Layers className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-1 text-lg font-medium">No plans yet</h3>
          <p className="text-muted-foreground">
            Add a plan before selling manager accounts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MANAGER_PLANS.map((plan) => {
            const inUse = usage(plan.id);

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col ${
                  plan.popular ? "border-primary shadow-sm" : ""
                }`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-2 left-4">Most popular</Badge>
                )}

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="-mr-2 -mt-1 h-8 w-8 shrink-0 p-0"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">
                            Actions for the {plan.name} plan
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/dashboard/admin/billing/plans/${plan.id}/edit`
                            )
                          }
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit plan
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setDeleteTarget(plan);
                            setDeleteOpen(true);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete plan
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="text-xs">
                    {plan.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">
                        {plan.monthlyPrice === null
                          ? "Negotiated"
                          : `£${plan.monthlyPrice.toLocaleString("en-GB")}`}
                      </span>
                      {plan.monthlyPrice !== null && (
                        <span className="text-muted-foreground text-xs">
                          /mo
                        </span>
                      )}
                    </div>
                    {plan.annualPrice !== null && plan.annualPrice > 0 && (
                      <p className="text-muted-foreground text-xs">
                        £{plan.annualPrice.toLocaleString("en-GB")} per year
                      </p>
                    )}
                    {plan.pricePerUnit ? (
                      <p className="text-xs font-medium">
                        + £{plan.pricePerUnit.toLocaleString("en-GB")} per unit
                        / month
                      </p>
                    ) : null}
                  </div>

                  <p className="text-muted-foreground text-xs">
                    {plan.unitLimit === null
                      ? "Unlimited units"
                      : `Up to ${plan.unitLimit.toLocaleString("en-GB")} units`}
                  </p>

                  <ul className="flex-1 space-y-1.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-xs"
                      >
                        <Check className="text-primary mt-0.5 h-3 w-3 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="text-muted-foreground flex items-center gap-1.5 border-t pt-3 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    {inUse === 0
                      ? "No accounts"
                      : `${inUse} account${inUse === 1 ? "" : "s"}`}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-muted-foreground text-sm">
        Plans are defined in code for now
        <span className="font-mono text-xs"> (src/lib/billing/plans.ts)</span>.
        Adding, editing or deleting here validates the details but does not
        persist yet.
      </p>

      <DeletePlanDialog
        plan={deleteTarget}
        accountsOnPlan={deleteTarget ? usage(deleteTarget.id) : 0}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        // Retires the plan (deactivates the role) rather than deleting it.
        // The API refuses while any subscription or user is still on it — a
        // plan id is stored on both, so removing one in use would leave
        // subscriptions pointing at nothing and users on a role that
        // resolves to no permissions.
        onConfirm={async (plan) => {
          const response = await fetch(`/api/billing/plans/${plan.id}`, {
            method: "DELETE",
          });
          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.success) {
            showSimpleError(
              "Plan not retired",
              result?.error || "The plan could not be retired."
            );
            return;
          }

          showSimpleSuccess("Plan retired", `${plan.name} is no longer sold.`);
          setDeleteOpen(false);
          await refetchPlans();
        }}
      />
    </div>
  );
}
