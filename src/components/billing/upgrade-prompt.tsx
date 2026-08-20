"use client";

import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface UnitAllowanceInfo {
  planId: string;
  planName: string;
  limit: number | null;
  used: number;
}

interface UpgradePromptProps {
  /** Message from the API — it already names the plan, limit and usage. */
  message: string;
  allowance?: UnitAllowanceInfo;
  /** Where to send them. The API returns this so the link is not duplicated. */
  upgradeUrl?: string;
  className?: string;
}

/**
 * Shown when a plan ceiling blocks an action.
 *
 * Deliberately not a toast: a toast disappears, and the user is left looking at
 * a form that refuses to submit with no explanation of why. This stays on the
 * page next to the thing they were trying to do, and carries the way out.
 */
export function UpgradePrompt({
  message,
  allowance,
  upgradeUrl = "/pricing",
  className,
}: UpgradePromptProps) {
  return (
    <Alert className={className}>
      <Lock className="h-4 w-4" />
      <AlertTitle>
        {allowance
          ? `You've reached your ${allowance.planName} plan limit`
          : "Plan limit reached"}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">{message}</p>

        {allowance?.limit !== null && allowance && (
          <p className="text-muted-foreground text-xs">
            Using {allowance.used} of {allowance.limit} unit
            {allowance.limit === 1 ? "" : "s"}.
          </p>
        )}

        <Button asChild size="sm">
          <Link href={upgradeUrl}>
            View plans
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The 403 body the billing routes return when a plan ceiling is hit. */
export interface UnitLimitError {
  error: string;
  code: string;
  allowance?: UnitAllowanceInfo;
  upgradeUrl?: string;
}

export const UNIT_LIMIT_CODE = "UNIT_LIMIT_REACHED";

/** Narrow an arbitrary API error body to a plan-limit refusal. */
export function asUnitLimitError(body: any): UnitLimitError | null {
  return body && body.code === UNIT_LIMIT_CODE ? (body as UnitLimitError) : null;
}
