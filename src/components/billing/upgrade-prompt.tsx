"use client";

import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface UnitAllowanceInfo {
  planId: string;
  planName: string;
  limit: number | null;
  used: number;
  requested?: number;
}

interface UpgradePromptProps {
  /** Message from the API — it already names the plan, limit and usage. */
  message: string;
  allowance?: UnitAllowanceInfo;
  /** Where to send them. The API returns this so the link is not duplicated. */
  upgradeUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shown when a plan ceiling blocks an action.
 *
 * A modal rather than an inline alert: the refusal is the answer to something
 * the user just did, and it has to interrupt. An inline banner above a long
 * property form can sit off-screen entirely — the save appears to do nothing.
 *
 * Dismissable on purpose. The user's edits are still in the form behind it, so
 * trapping them here would mean losing that work to read the message.
 */
export function UpgradePrompt({
  message,
  allowance,
  upgradeUrl = "/landing/pricing",
  open,
  onOpenChange,
}: UpgradePromptProps) {
  const showUsage = allowance && allowance.limit !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-muted mb-3 flex h-10 w-10 items-center justify-center rounded-full">
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle>
            {allowance
              ? `You've reached your ${allowance.planName} plan limit`
              : "Plan limit reached"}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        {showUsage && (
          <p className="text-muted-foreground text-sm">
            Using {allowance!.used} of {allowance!.limit} unit
            {allowance!.limit === 1 ? "" : "s"}.
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button asChild>
            <Link href={upgradeUrl}>
              View plans
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
