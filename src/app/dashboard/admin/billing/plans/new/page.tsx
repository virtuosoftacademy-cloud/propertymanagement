"use client";

/**
 * Add plan — ADMIN only.
 *
 * The guard is inherited from src/app/dashboard/admin/billing/layout.tsx.
 *
 * UI ONLY. Submitting validates and returns to the plans list; the catalogue
 * still lives in src/lib/billing/plans.ts, so nothing is persisted yet.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlanForm } from "@/components/billing/plan-form";
import { showSimpleSuccess } from "@/lib/toast-notifications";
import type { PlanFormValues } from "@/lib/billing/plan-schema";

export default function NewPlanPage() {
  const router = useRouter();

  const backToPlans = () => router.push("/dashboard/admin/billing/plans");

  const handleSubmit = (values: PlanFormValues) => {
    // TODO(billing): POST /api/plans once the catalogue moves to the database.
    // The values are already validated and typed by the time they arrive here.
    showSimpleSuccess("Plan added", `${values.name} has been created.`);
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
          Add plan
        </h1>
        <p className="text-muted-foreground">
          Define what a manager account can be sold for.
        </p>
      </div>

      <div className="max-w-3xl">
        <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
          <CardContent className="pt-6">
            <PlanForm onSubmit={handleSubmit} onCancel={backToPlans} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
