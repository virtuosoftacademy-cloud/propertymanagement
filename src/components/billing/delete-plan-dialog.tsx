"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Users } from "lucide-react";
import type { ManagerPlan } from "@/lib/billing/plans";

interface DeletePlanDialogProps {
  plan: ManagerPlan | null;
  /** How many accounts reference this plan. Non-zero blocks the delete. */
  accountsOnPlan: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (plan: ManagerPlan) => void;
}

/**
 * Deleting a plan that accounts still reference would leave those accounts
 * pointing at an ID that resolves to nothing — their plan name, unit limit and
 * price would all read as blank. So the delete is blocked rather than warned
 * about, and the dialog says how to clear the blockage.
 */
export function DeletePlanDialog({
  plan,
  accountsOnPlan,
  open,
  onOpenChange,
  onConfirm,
}: DeletePlanDialogProps) {
  if (!plan) return null;

  const blocked = accountsOnPlan > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className={`h-5 w-5 ${blocked ? "text-amber-500" : "text-destructive"}`}
            />
            {blocked ? "Cannot delete this plan" : `Delete ${plan.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {blocked ? (
              <div className="space-y-3">
                <p>
                  {accountsOnPlan} account
                  {accountsOnPlan === 1 ? " is" : "s are"} still on the{" "}
                  <span className="font-medium">{plan.name}</span> plan. Deleting
                  it would leave them pointing at a plan that no longer exists.
                </p>
                <div className="bg-muted/50 flex items-start gap-2 rounded-lg p-3">
                  <Users className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-sm">
                    Move those accounts to another plan first, then delete this
                    one.
                  </span>
                </div>
              </div>
            ) : (
              <span>
                No accounts are using{" "}
                <span className="font-medium">{plan.name}</span>, so removing it
                affects nothing. This cannot be undone.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>
            {blocked ? "Close" : "Cancel"}
          </AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction
              onClick={() => onConfirm(plan)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete plan
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
